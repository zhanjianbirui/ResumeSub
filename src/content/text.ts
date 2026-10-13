export const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

const CONTROLS = 'input, select, textarea, button, option';

/** 祖先节点去掉所有表单控件后剩下的文字（用来处理"span + input"这种没有 label 的结构）。 */
export function textOutsideControls(ancestor: Element): string {
  const copy = ancestor.cloneNode(true) as Element;
  copy.querySelectorAll(CONTROLS).forEach((node) => node.remove());
  return clean(copy.textContent);
}
