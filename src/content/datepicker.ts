import type { FillContext, FillOutcome } from './fill';
import { setNativeValue } from './native';
import { isVisible, layoutAvailable } from './visibility';

const SETTLE_MS = 60;
/** 失焦后组件可能延迟校验并清空非法输入，等这么久再回读。 */
const VERIFY_MS = 120;
const PANEL = '.ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .el-picker__popper, .el-picker-panel';

function key(el: HTMLElement, name: string, code: number) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode: code, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: name, code: name, keyCode: code, bubbles: true }));
}

/** 页面上有没有可见的日期面板：只有面板确实打开时才发 Enter/Escape，避免触发页面或弹窗自己的快捷键。 */
function panelOpen(doc: Document): boolean {
  const layout = layoutAvailable(doc);
  return [...doc.querySelectorAll<HTMLElement>(PANEL)].some((panel) => isVisible(panel, layout));
}

function restoreFocus(previous: Element | null, el: HTMLInputElement) {
  if (previous instanceof HTMLElement && previous !== el && previous !== el.ownerDocument.body && previous.isConnected) {
    previous.focus({ preventScroll: true });
  }
}

/** 日期组件一般允许直接输入：写入值，面板打开时按 Enter 提交，失焦后等组件校验完再回读确认，最后还原焦点。 */
export async function fillDatePicker(el: HTMLInputElement, value: string, ctx: FillContext): Promise<FillOutcome> {
  if (el.value.trim() !== '') return 'skipped';
  if (el.readOnly) return 'failed'; // 只读输入框写了值组件的数据模型也不会更新
  const previous = ctx.doc.activeElement;
  el.focus({ preventScroll: true });
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  if (panelOpen(ctx.doc)) key(el, 'Enter', 13);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await ctx.wait(SETTLE_MS);
  el.blur();
  await ctx.wait(VERIFY_MS);
  if (panelOpen(ctx.doc)) key(el, 'Escape', 27);
  restoreFocus(previous, el);
  return el.value.trim() !== '' ? 'filled' : 'failed';
}
