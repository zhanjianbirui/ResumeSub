import type { FillInstruction } from '@/shared/autofill-types';
import { chooseOption } from '@/shared/option-match';
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
const HIDDEN_DROPDOWN = '.ant-select-dropdown-hidden';

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

/** ARIA 控件优先用 aria-controls 指向的列表；否则取展开后新出现的下拉层（没有新的就取最后一个可见的）。 */
function currentDropdown(root: HTMLElement, flavor: Flavor, before: ReadonlySet<HTMLElement>, doc: Document): HTMLElement | null {
  const controls = flavor === ARIA ? root.getAttribute('aria-controls') : null;
  const owned = controls ? doc.getElementById(controls) : null;
  const open = openDropdowns(flavor, doc);
  if (owned) return open.includes(owned) ? owned : null;
  return open.filter((d) => !before.has(d)).pop() ?? open.pop() ?? null;
}

function optionsIn(dropdown: HTMLElement | null, flavor: Flavor, doc: Document): HTMLElement[] {
  if (!dropdown) return [];
  const layout = layoutAvailable(doc);
  return [...dropdown.querySelectorAll<HTMLElement>(flavor.option)].filter((o) => shown(o, layout));
}

async function waitForDropdown(open: () => HTMLElement | null, ctx: FillContext): Promise<HTMLElement | null> {
  for (let waited = 0; waited <= ctx.timeoutMs; waited += POLL_MS) {
    const found = open();
    if (found) return found;
    await ctx.wait(POLL_MS);
  }
  return null;
}

/** 先按 Escape 收起；组件不响应 Escape 时再点一次展开按钮把它收起。 */
async function close(opener: HTMLElement, dropdown: HTMLElement | null, flavor: Flavor, ctx: FillContext) {
  const target = opener.closest('.ant-select, .el-select')?.querySelector<HTMLElement>('input') ?? opener;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  await ctx.wait(POLL_MS);
  if (dropdown && openDropdowns(flavor, ctx.doc).includes(dropdown)) press(opener, 'mousedown', 'mouseup', 'click');
}

function pick(options: readonly HTMLElement[], fill: FillInstruction): HTMLElement | undefined {
  const wanted = [fill.value ?? '', ...(fill.candidates ?? [])].filter(Boolean);
  const labels = options.map((o, i) => ({ value: String(i), label: clean(o.textContent) }));
  const index = chooseOption(labels, wanted);
  return index === null ? undefined : options[Number(index)];
}

/** 展开下拉框 → 等选项渲染 → 用候选文字本地匹配 → 点击；匹配失败就收起，不改动当前值。 */
export async function fillCombobox(root: HTMLElement, fill: FillInstruction, ctx: FillContext): Promise<FillOutcome> {
  if (hasSelection(root)) return 'skipped';
  if (!fill.value && !(fill.candidates?.length)) return 'failed';
  const flavor = flavorOf(root);
  const opener = root.matches(flavor.opener) ? root : root.querySelector<HTMLElement>(flavor.opener) ?? root;
  const before = new Set(openDropdowns(flavor, ctx.doc));
  press(opener, 'mousedown', 'mouseup', 'click');
  const dropdown = await waitForDropdown(() => currentDropdown(root, flavor, before, ctx.doc), ctx);
  const target = pick(optionsIn(dropdown, flavor, ctx.doc), fill);
  if (!target) {
    await close(opener, dropdown, flavor, ctx);
    return 'failed';
  }
  press(target, 'mousedown', 'mouseup', 'click');
  await ctx.wait(POLL_MS);
  return hasSelection(root) ? 'filled' : 'failed';
}
