import { ADAPTERS, activeAdapter } from './adapters';
import { clean, textOutsideControls } from './text';
import { formItemLabel } from './widgets';

const MAX_LABEL = 60;
const HEADING = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > legend, :scope > [role="heading"], :scope > [class*="title"]';
/** Ant Design 的日期框到区块标题之间可能隔 9 层以上的包装。 */
const MAX_SECTION_DEPTH = 14;

export { clean, textOutsideControls };

export function controlCount(ancestor: Element): number {
  return ancestor.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
}

function nearbyText(el: HTMLElement): string {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    if (controlCount(node) > 1) break;
    const text = textOutsideControls(node);
    if (text && text.length <= MAX_LABEL) return text;
  }
  const prev = el.previousElementSibling;
  return prev && controlCount(prev) === 0 ? clean(prev.textContent).slice(0, MAX_LABEL) : '';
}

export function resolveLabel(el: HTMLElement): string {
  // 没有注册任何适配器时不必解析 URL。
  const adapted = ADAPTERS.length > 0 ? activeAdapter(el.ownerDocument.location?.href ?? '')?.labelFor?.(el) : null;
  if (adapted) return adapted;
  const labels = (el as HTMLInputElement).labels;
  const direct = labels && labels.length > 0 ? textOutsideControls(labels[0] as Element) : '';
  if (direct) return direct;
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(labelledBy.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent).join(' '));
    if (text) return text;
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const item = formItemLabel(el);
  if (item) return item;
  const near = nearbyText(el);
  if (near) return near;
  return clean(el.getAttribute('placeholder'));
}

const precedes = (heading: Element, el: Element) =>
  !heading.contains(el) && (heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** 每一层祖先取位于字段之前、离字段最近的标题（同一表单里多个 h3 并列时取字段所在的那一段）。 */
function headingIn(node: Element, el: HTMLElement): string {
  const headings = Array.from(node.querySelectorAll(HEADING)).filter((h) => precedes(h, el));
  const text = clean(headings[headings.length - 1]?.textContent);
  return text.length <= MAX_LABEL ? text : '';
}

export function sectionOf(el: HTMLElement): string {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < MAX_SECTION_DEPTH; depth++, node = node.parentElement) {
    const text = headingIn(node, el);
    if (text) return text;
  }
  return '';
}
