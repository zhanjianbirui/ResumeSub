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
  return rect.right >= 0 && rect.bottom >= 0;
}

/** 用户看得见的控件：未隐藏、非透明，并且（有布局时）有尺寸且不在屏幕左侧或上方之外。 */
export function isVisible(el: HTMLElement, layout: boolean): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  if (!cssVisible(el)) return false;
  return !layout || onScreen(el);
}

const UPLOAD_CONTAINER = 'label, button, [role="button"], [class*="upload"]';

/** 上传框通常隐藏在按钮或 label 后面：只要它的 label 或外层上传按钮可见就算可用。 */
export function isFileReachable(el: HTMLInputElement, layout: boolean): boolean {
  if (isVisible(el, layout)) return true;
  const container = el.parentElement?.closest<HTMLElement>(UPLOAD_CONTAINER);
  const candidates = [...Array.from(el.labels ?? []), ...(container ? [container] : [])];
  return candidates.some((c) => isVisible(c, layout));
}
