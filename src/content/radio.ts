import { clean, controlCount } from './label';

const MAX_LABEL = 60;

/** 单选组按"所属表单 + name"划分：两个表单里同名的 sex 单选是两组。 */
export function radioGroup(el: HTMLInputElement): HTMLInputElement[] {
  return Array.from(el.ownerDocument.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    .filter((r) => r.name === el.name && r.form === el.form);
}

function commonContainer(group: readonly HTMLInputElement[]): HTMLElement | null {
  let container: HTMLElement | null = group[0]?.parentElement ?? null;
  while (container && !group.every((r) => container?.contains(r))) container = container.parentElement;
  return container;
}

function textWithout(node: Element, selector: string): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll(selector).forEach((n) => n.remove());
  return clean(copy.textContent);
}

/** 父节点去掉选项 label 和控件后的文字（Ant Design：<label>性别</label> 与单选组是兄弟）。 */
function parentText(parent: Element): string {
  const copy = parent.cloneNode(true) as Element;
  copy.querySelectorAll('label').forEach((n) => {
    if (n.querySelector('input')) n.remove();
  });
  copy.querySelectorAll('input, select, textarea').forEach((n) => n.remove());
  return clean(copy.textContent);
}

function ariaLabel(container: HTMLElement): string {
  const group = container.closest('[role="radiogroup"]');
  if (!group) return '';
  const ids = group.getAttribute('aria-labelledby');
  const byId = ids ? clean(ids.split(/\s+/).map((id) => group.ownerDocument.getElementById(id)?.textContent).join(' ')) : '';
  return byId || clean(group.getAttribute('aria-label'));
}

function legendLabel(container: HTMLElement, size: number): string {
  const fieldset = container.closest('fieldset');
  if (!fieldset || controlCount(fieldset) !== size) return '';
  return clean(fieldset.querySelector(':scope > legend')?.textContent);
}

/** 依次尝试：radiogroup 的 aria 标注 → 容器自身文字 → 只含本组的 fieldset 的 legend → 前一个兄弟 → 父节点文字。 */
export function radioGroupLabel(group: readonly HTMLInputElement[]): string {
  const container = commonContainer(group);
  if (!container) return '';
  const holder = container.parentElement && container.tagName === 'LABEL' ? container.parentElement : container;
  const prev = holder.previousElementSibling;
  const candidates = [
    () => ariaLabel(container),
    () => textWithout(holder, 'label, input'),
    () => legendLabel(container, group.length),
    () => (prev && controlCount(prev) === 0 ? clean(prev.textContent) : ''),
    () => (holder.parentElement ? parentText(holder.parentElement) : ''),
  ];
  for (const candidate of candidates) {
    const text = candidate();
    if (text) return text.slice(0, MAX_LABEL);
  }
  return '';
}
