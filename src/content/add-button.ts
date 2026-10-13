import type { EntryGroup } from '@/shared/autofill-types';
import { sectionOf } from './label';
import { repeatBlockOf } from './repeat';
import { clean } from './text';
import { isVisible, layoutAvailable } from './visibility';

const ADD = /添加|新增|增加|\badd\b/i;
const NOT_ADD = /删除|移除|remove|delete|附件|attachment|上传|upload|保存|提交|下一步|submit|next/i;
const CLICKABLE = 'button, a, [role="button"], [class*="add"]';
const BUTTON_LIKE = 'button, a, [role="button"]';
/** 按钮文字点名的分组；按顺序判断，"项目经历""教育经历"先于泛指的"经历"。 */
const GROUP_TEXT: readonly (readonly [EntryGroup, RegExp])[] = [
  ['education', /教育|学历|education/i],
  ['projects', /项目|project/i],
  ['experience', /工作|实习|经历|experience|work/i],
];
/** 没有识别出重复区块时，从字段往上找的层数（Ant Form.List：字段到按钮所在容器约 7-9 层）。 */
const MAX_DEPTH = 12;
/** 识别出重复区块时，只在区块的父级及以上 4 层里找。 */
const BLOCK_LEVELS = 4;
/** 识别出重复区块时，不点名分组的"添加"只在区块父级和再上一层里接受。 */
const GENERIC_LEVELS = 2;
const MAX_ADD_TEXT = 20;

/** 类名里有独立的 add 词（btn-add、add_row、add），而不是 address 这类单词的一部分。 */
const hasAddClass = (el: Element) =>
  Array.from(el.classList).some((token) => token.toLowerCase().split(/[-_]/).includes('add'));

/** 链接只允许 # 或 javascript:；表单里的 submit 按钮和没写 type 的按钮都会提交表单。 */
function unsafeInteractive(el: HTMLElement): boolean {
  if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) return true;
  if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) {
    const href = (el.getAttribute('href') ?? '').trim().toLowerCase();
    if (href !== '' && href !== '#' && !href.startsWith('javascript:')) return true;
  }
  if (el instanceof HTMLButtonElement) {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    if (type === 'submit' || (type === '' && el.form)) return true;
  }
  return false;
}

/** 候选自身和最近的可交互祖先（a[href] / button）都要安全：button 里套 span 点下去照样提交表单。 */
function safeToClick(el: HTMLElement): boolean {
  if (unsafeInteractive(el)) return false;
  const host = el.parentElement?.closest<HTMLElement>('a[href], button');
  if (host && unsafeInteractive(host)) return false;
  return el.matches(BUTTON_LIKE) || hasAddClass(el);
}

function looksLikeAdd(el: HTMLElement, layout: boolean): boolean {
  if (!safeToClick(el) || !isVisible(el, layout)) return false;
  const text = clean(el.textContent);
  return text.length > 0 && text.length <= MAX_ADD_TEXT && ADD.test(text) && !NOT_ADD.test(text);
}

const groupOfText = (text: string): EntryGroup | null => GROUP_TEXT.find(([, re]) => re.test(text))?.[0] ?? null;

/** 在一层里选按钮：点名本分组的优先；不点名的只在允许时、且这一层没有别的分组的按钮时才用。 */
function pickIn(node: HTMLElement, group: EntryGroup | undefined, genericOk: (el: HTMLElement) => boolean, layout: boolean): HTMLElement | null {
  const candidates = [...node.querySelectorAll<HTMLElement>(CLICKABLE)].filter((el) => looksLikeAdd(el, layout));
  const tagged = candidates.map((el) => ({ el, group: groupOfText(clean(el.textContent)) }));
  if (!group) return tagged[0]?.el ?? null;
  const own = tagged.find((c) => c.group === group);
  if (own) return own.el;
  const foreign = tagged.some((c) => c.group !== null);
  return foreign ? null : tagged.find((c) => c.group === null && genericOk(c.el))?.el ?? null;
}

/**
 * 找"添加"类按钮（排除删除、上传、提交、下一步）：先定位 anchor 所在的重复区块，从区块的父级往上找；
 * 页面上只有一个区块时从 anchor 往上找。
 */
export function findAddButton(anchor: HTMLElement, group?: EntryGroup): HTMLElement | null {
  const layout = layoutAvailable(anchor.ownerDocument);
  const block = repeatBlockOf(anchor);
  const limit = block ? BLOCK_LEVELS : MAX_DEPTH;
  let node: HTMLElement | null = (block ?? anchor).parentElement;
  const anchorSection = block ? '' : sectionOf(anchor);
  for (let depth = 0; node && depth < limit; depth++, node = node.parentElement) {
    // 有区块时只看层数；没有区块时，不点名分组的按钮必须和 anchor 同一个小节。
    const genericOk = (el: HTMLElement) => (block ? depth < GENERIC_LEVELS : sectionOf(el) === anchorSection);
    const hit = pickIn(node, group, genericOk, layout);
    if (hit) return hit;
  }
  return null;
}
