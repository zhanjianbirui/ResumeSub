import type { FillContext, FillOutcome } from './fill';
import { setNativeValue } from './native';

const SETTLE_MS = 60;

function key(el: HTMLElement, name: string, code: number) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode: code, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: name, code: name, keyCode: code, bubbles: true }));
}

/** 日期组件一般允许直接输入：先写入值，再按 Enter 提交，最后按 Escape 收起面板；写入后回读确认。 */
export async function fillDatePicker(el: HTMLInputElement, value: string, ctx: FillContext): Promise<FillOutcome> {
  if (el.value.trim() !== '') return 'skipped';
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  key(el, 'Enter', 13);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await ctx.wait(SETTLE_MS);
  key(el, 'Escape', 27);
  el.blur();
  return el.value.trim() !== '' ? 'filled' : 'failed';
}
