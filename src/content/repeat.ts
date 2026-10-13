import { textOutsideControls } from './label';
import { isVisible } from './visibility';

const CONTROLS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea';
/** 与 background 的 MAX_REPEAT_INDEX 保持一致（content 不引入 valibot schema，这里复制数值）。 */
const MAX_REPEAT_INDEX = 50;
const MAX_DEPTH = 10;
/** 交互/校验状态类名不参与"同类区块"判断（只有某一段显示错误、被选中时也算同类）。 */
const UNSTABLE_CLASS = /active|error|focus|hover|^is-|^has-|selected|disabled/i;
/** name 里的数字和方括号下标（edu[0].school、school1）不影响字段是否等价。 */
const NAME_INDEX = /\[[^\]]*\]|\d+/g;

/** 一次扫描内的缓存：区块内可见控件、区块去掉控件后的文字。 */
export interface RepeatCache {
  controls: WeakMap<Element, HTMLElement[]>;
  text: WeakMap<Element, string>;
}

export const createRepeatCache = (): RepeatCache => ({ controls: new WeakMap(), text: new WeakMap() });

function visibleControls(node: Element, cache: RepeatCache): HTMLElement[] {
  const cached = cache.controls.get(node);
  if (cached) return cached;
  const value = Array.from(node.querySelectorAll<HTMLElement>(CONTROLS)).filter((c) => isVisible(c, false));
  cache.controls.set(node, value);
  return value;
}

function blockText(node: Element, cache: RepeatCache): string {
  const cached = cache.text.get(node);
  if (cached !== undefined) return cached;
  const value = textOutsideControls(node);
  cache.text.set(node, value);
  return value;
}

const stableClasses = (el: Element) =>
  Array.from(el.classList).filter((token) => !UNSTABLE_CLASS.test(token)).sort().join(' ');

const typeOf = (el: Element) => `${el.tagName}:${(el as HTMLInputElement).type ?? ''}`;
const normalizedName = (el: Element) => ((el as HTMLInputElement).name ?? '').replace(NAME_INDEX, '');

/** 与 node 同标签、同稳定类名、可见且含控件的兄弟（含 node 自身），按文档顺序。 */
function peersOf(node: Element, cache: RepeatCache): Element[] {
  const parent = node.parentElement;
  if (!parent) return [node];
  const shape = `${node.tagName}.${stableClasses(node)}`;
  return Array.from(parent.children).filter((c) => c === node || (
    `${c.tagName}.${stableClasses(c)}` === shape
    && isVisible(c as HTMLElement, false)
    && visibleControls(c, cache).length > 0));
}

/** 自定义下拉框根节点（不是原生控件）：区块里有同标签、同主类名的根节点，且区块文字里出现同一标签。 */
function hasEquivalentWidget(peer: Element, el: HTMLElement, label: string, cache: RepeatCache): boolean {
  const primary = el.classList[0];
  const shape = primary ? `${el.tagName}.${CSS.escape(primary)}` : el.tagName;
  if (peer.querySelector(shape) === null) return false;
  return label === '' || blockText(peer, cache).includes(label);
}

/** 区块里有没有与 el 等价的控件：同标签同类型，且 name（去下标后）相同或区块文字里出现 el 的标签。 */
function hasEquivalent(peer: Element, el: HTMLElement, label: string, cache: RepeatCache): boolean {
  if (peer.contains(el)) return true;
  if (!el.matches(CONTROLS)) return hasEquivalentWidget(peer, el, label, cache);
  const name = normalizedName(el);
  const sameKind = visibleControls(peer, cache).filter((c) => typeOf(c) === typeOf(el));
  if (sameKind.length === 0) return false;
  if (name && sameKind.some((c) => normalizedName(c) === name)) return true;
  return label !== '' && blockText(peer, cache).includes(label);
}

interface RepeatBlock {
  block: Element;
  index: number;
}

/**
 * 从字段往上找最近的"重复区块"：区块至少含 2 个可见控件（排除日期范围这类单控件包装），
 * 并且至少有 2 个同类兄弟区块含有与该字段等价的控件。
 */
function findBlock(el: HTMLElement, label: string, cache: RepeatCache): RepeatBlock | null {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < MAX_DEPTH; depth++, node = node.parentElement) {
    if (visibleControls(node, cache).length < 2) continue;
    const block = node;
    const matching = peersOf(block, cache).filter((peer) => hasEquivalent(peer, el, label, cache));
    if (matching.length >= 2) return { block, index: matching.indexOf(block) };
  }
  return null;
}

/** 字段所在重复区块的序号，找不到为 0。 */
export function repeatIndexOf(el: HTMLElement, label: string, cache: RepeatCache = createRepeatCache()): number {
  return Math.min(findBlock(el, label, cache)?.index ?? 0, MAX_REPEAT_INDEX);
}

/** 字段所在的重复区块元素（页面上只有一个区块时为 null）。 */
export const repeatBlockOf = (el: HTMLElement, label = ''): Element | null => findBlock(el, label, createRepeatCache())?.block ?? null;
