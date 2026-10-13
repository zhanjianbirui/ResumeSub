import type { FillInstruction } from '@/shared/autofill-types';
import { chooseOption, type MatchMode } from '@/shared/option-match';
import type { FillContext, FillOutcome } from './fill';
import { clean } from './text';
import { isVisible, layoutAvailable } from './visibility';
import { hasSelection } from './widgets';

/** 各框架的下拉层与选项：只认框架自己的类名（Ant 下拉层里还有一份高度为 0 的无障碍 listbox，不能用）。 */
interface Flavor {
  dropdown: string;
  option: string;
  opener: string;
}

const ANT: Flavor = {
  dropdown: '.ant-select-dropdown',
  option: '.ant-select-item-option:not(.ant-select-item-option-disabled)',
  opener: '.ant-select-selector',
};
const ELEMENT: Flavor = {
  dropdown: '.el-select-dropdown',
  option: '.el-select-dropdown__item:not(.is-disabled)',
  opener: '.el-select__wrapper, .el-input__inner, .el-input',
};
const ARIA: Flavor = {
  dropdown: '[role="listbox"]',
  option: '[role="option"]:not([aria-disabled="true"])',
  opener: '[aria-haspopup="listbox"]',
};
const POLL_MS = 30;
/** Escape 之后最多等这么久让下拉层的收起动画结束，再决定要不要点展开按钮把它收起。 */
const CLOSE_MS = 300;
const HIDDEN_DROPDOWN = '.ant-select-dropdown-hidden';
/** Ant Design（rc-virtual-list）只渲染可视窗口内的选项。 */
const VIRTUAL_HOLDER = '.rc-virtual-list-holder';
const MAX_SCROLL_STEPS = 20;
/** 无布局环境下 clientHeight 为 0 时的滚动步长。 */
const SCROLL_STEP_PX = 256;
/** 选项文字带括号限定（"北京大学（医学部）"）时，不能凭部分匹配从局部窗口里选它。 */
const BRACKETED = /[（(【[]/;

function flavorOf(root: HTMLElement): Flavor {
  if (root.matches('.ant-select')) return ANT;
  if (root.matches('.el-select')) return ELEMENT;
  return ARIA;
}

function press(target: HTMLElement, ...types: string[]) {
  for (const type of types) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

const shown = (el: HTMLElement, layout: boolean) => !el.closest(HIDDEN_DROPDOWN) && isVisible(el, layout);

/** 当前可见、并且含可见选项的下拉层，按文档顺序。 */
function openDropdowns(flavor: Flavor, doc: Document): HTMLElement[] {
  const layout = layoutAvailable(doc);
  return [...doc.querySelectorAll<HTMLElement>(flavor.dropdown)]
    .filter((d) => shown(d, layout) && [...d.querySelectorAll<HTMLElement>(flavor.option)].some((o) => shown(o, layout)));
}

/** root 自身或其内部输入框通过 aria-controls / aria-owns 指向的列表 id。 */
function anchoredId(root: HTMLElement): string | null {
  const own = root.getAttribute('aria-controls') ?? root.getAttribute('aria-owns');
  if (own) return own;
  const inner = root.querySelector('[aria-controls], [aria-owns]');
  return inner?.getAttribute('aria-controls') ?? inner?.getAttribute('aria-owns') ?? null;
}

/** 只接受锚定到 root 的下拉层，或展开后才出现的下拉层；绝不退回到别的控件留下的可见下拉层。 */
function currentDropdown(root: HTMLElement, flavor: Flavor, before: ReadonlySet<HTMLElement>, doc: Document): HTMLElement | null {
  const open = openDropdowns(flavor, doc);
  const id = anchoredId(root);
  const owned = id ? doc.getElementById(id) : null;
  const anchored = owned ? owned.closest<HTMLElement>(flavor.dropdown) ?? owned : null;
  if (anchored && open.includes(anchored)) return anchored;
  if (owned && flavor === ARIA) return null;
  return open.filter((d) => !before.has(d)).pop() ?? null;
}

function optionsIn(dropdown: HTMLElement, flavor: Flavor, doc: Document): HTMLElement[] {
  const layout = layoutAvailable(doc);
  return [...dropdown.querySelectorAll<HTMLElement>(flavor.option)].filter((o) => shown(o, layout));
}

/** 按墙钟时间轮询，直到 probe 返回非 null 或超时。 */
async function poll<T>(probe: () => T | null, ms: number, ctx: FillContext): Promise<T | null> {
  const deadline = Date.now() + ms;
  for (;;) {
    const found = probe();
    if (found !== null) return found;
    if (Date.now() >= deadline) return null;
    await ctx.wait(POLL_MS);
  }
}

/** 先按 Escape；等下拉层真正收起（最多 300ms），仍未收起才再点一次展开按钮。 */
async function close(root: HTMLElement, opener: HTMLElement, dropdown: HTMLElement | null, flavor: Flavor, ctx: FillContext) {
  if (openDropdowns(flavor, ctx.doc).length === 0) return;
  const target = root.querySelector<HTMLElement>('input') ?? opener;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  if (!dropdown) return;
  const closed = await poll(() => (openDropdowns(flavor, ctx.doc).includes(dropdown) ? null : true), CLOSE_MS, ctx);
  if (!closed) press(opener, 'mousedown', 'mouseup', 'click');
}

const wantedOf = (fill: FillInstruction) => [fill.value ?? '', ...(fill.candidates ?? [])].filter(Boolean);

function pick(options: readonly HTMLElement[], wanted: readonly string[], mode: MatchMode): HTMLElement | undefined {
  const labels = options.map((o, i) => ({ value: String(i), label: clean(o.textContent) }));
  const index = chooseOption(labels, wanted, mode);
  return index === null ? undefined : options[Number(index)];
}

const unbracketed = (options: readonly HTMLElement[]) => options.filter((o) => !BRACKETED.test(o.textContent ?? ''));

function scroller(dropdown: HTMLElement): HTMLElement | null {
  const holder = dropdown.querySelector<HTMLElement>(VIRTUAL_HOLDER);
  if (holder) return holder;
  return dropdown.scrollHeight > dropdown.clientHeight ? dropdown : null;
}

/** 向下滚一屏；已经到底（scrollTop 没变）返回 false。 */
function scrollDown(list: HTMLElement): boolean {
  const before = list.scrollTop;
  list.scrollTop = before + (list.clientHeight || SCROLL_STEP_PX);
  list.dispatchEvent(new Event('scroll'));
  return list.scrollTop !== before;
}

/** 虚拟列表只渲染一部分选项：没有精确/整词匹配时逐屏往下找；最后才接受不带括号限定的包含式匹配。 */
async function findOption(dropdown: HTMLElement, flavor: Flavor, fill: FillInstruction, ctx: FillContext) {
  const wanted = wantedOf(fill);
  const list = scroller(dropdown);
  if (!list) return pick(optionsIn(dropdown, flavor, ctx.doc), wanted, 'loose');
  for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
    const options = optionsIn(dropdown, flavor, ctx.doc);
    const hit = pick(options, wanted, 'exact') ?? pick(unbracketed(options), wanted, 'strong');
    if (hit) return hit;
    if (!scrollDown(list)) break;
    await ctx.wait(POLL_MS);
  }
  return pick(unbracketed(optionsIn(dropdown, flavor, ctx.doc)), wanted, 'loose');
}

/** 展开下拉框 → 等选项渲染 → 用候选文字本地匹配 → 点击；任何失败都收起下拉层，不改动当前值。 */
export async function fillCombobox(root: HTMLElement, fill: FillInstruction, ctx: FillContext): Promise<FillOutcome> {
  if (hasSelection(root)) return 'skipped';
  if (!fill.value && !(fill.candidates?.length)) return 'failed';
  const flavor = flavorOf(root);
  const opener = root.matches(flavor.opener) ? root : root.querySelector<HTMLElement>(flavor.opener) ?? root;
  const before = new Set(openDropdowns(flavor, ctx.doc));
  press(opener, 'mousedown', 'mouseup', 'click');
  const dropdown = await poll(() => currentDropdown(root, flavor, before, ctx.doc), ctx.timeoutMs, ctx);
  const target = dropdown ? await findOption(dropdown, flavor, fill, ctx) : undefined;
  if (target) {
    press(target, 'mousedown', 'mouseup', 'click');
    await ctx.wait(POLL_MS);
    if (hasSelection(root)) return 'filled';
  }
  await close(root, opener, dropdown, flavor, ctx);
  return 'failed';
}
