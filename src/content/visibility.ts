type VisibilityCheck = (options: { checkOpacity: boolean; checkVisibilityCSS: boolean }) => boolean;

/** happy-dom 等无布局环境里所有元素尺寸都是 0，这时跳过尺寸检查。 */
export function layoutAvailable(doc: Document): boolean {
  return doc.documentElement.getBoundingClientRect().width > 0;
}

function styleVisible(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

/** 优先用浏览器原生的 checkVisibility（一次判断整条祖先链）；不支持时退回逐级检查 display/visibility。 */
function cssVisible(el: HTMLElement): boolean {
  const check = (el as unknown as { checkVisibility?: VisibilityCheck }).checkVisibility;
  const visible = typeof check === 'function'
    ? check.call(el, { checkOpacity: true, checkVisibilityCSS: true })
    : styleVisible(el);
  return visible && el.ownerDocument.defaultView?.getComputedStyle(el).opacity !== '0';
}

function onScreen(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const view = el.ownerDocument.defaultView;
  // 用文档坐标：页面往下滚过的控件视口坐标为负，但用户滚回去就能看到，不算屏幕外。
  return rect.right + (view?.scrollX ?? 0) >= 0 && rect.bottom + (view?.scrollY ?? 0) >= 0;
}

/** 用户看得见的控件：未隐藏、非透明，并且（有布局时）有尺寸且不在屏幕左侧或上方之外。 */
export function isVisible(el: HTMLElement, layout: boolean): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (!cssVisible(el)) return false;
  return !layout || onScreen(el);
}

const BUTTON_LIKE = 'button, [role="button"]';

/** 上传框通常隐藏在按钮或 label 后面：只有关联的 label（含外层 label）或直接父级按钮可见时才算可用。 */
export function isFileReachable(el: HTMLInputElement, layout: boolean): boolean {
  if (isVisible(el, layout)) return true;
  const wrapping = el.parentElement?.closest<HTMLElement>('label');
  const parent = el.parentElement;
  const button = parent?.matches(BUTTON_LIKE) ? parent : null;
  const candidates = [...Array.from(el.labels ?? []), ...(wrapping ? [wrapping] : []), ...(button ? [button] : [])];
  return candidates.some((c) => isVisible(c, layout));
}
