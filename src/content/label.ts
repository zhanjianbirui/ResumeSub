import { ADAPTERS, activeAdapter } from './adapters';
import { clean, textOutsideControls } from './text';
import { formItemLabel } from './widgets';

const MAX_LABEL = 60;
const HEADING = ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > legend, :scope > [role="heading"], :scope > [class*="title"]';
const MAX_SECTION_DEPTH = 8;

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

export function sectionOf(el: HTMLElement): string {
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < MAX_SECTION_DEPTH; depth++, node = node.parentElement) {
    const heading = node.querySelector(HEADING);
    if (heading && !heading.contains(el)) {
      const text = clean(heading.textContent);
      if (text && text.length <= MAX_LABEL) return text;
    }
  }
  return '';
}
