import { clean } from './text';

const SELECT_ROOT = '.ant-select, .el-select';
const ARIA_TRIGGER = '[role="combobox"]:not(input), button[aria-haspopup="listbox"]';
const PICKER = '.ant-picker, .el-date-editor, [class*="date-picker"], [class*="datepicker"]';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item';
/** 表单项里的控件多于 2 个时，说明它是包住多个字段的外层容器，不能当作单个字段的标签来源。 */
const MAX_ITEM_CONTROLS = 2;
const FORM_ITEM_LABEL = '.ant-form-item-label, .el-form-item__label, label';
const MAX_LABEL = 60;

/** 自定义下拉框的根节点：带框架类名的容器、ARIA combobox 本身，或 listbox 触发按钮。 */
export function comboboxRoot(el: HTMLElement): HTMLElement | null {
  const framework = el.closest<HTMLElement>(SELECT_ROOT);
  if (framework) return framework;
  if (el.matches(ARIA_TRIGGER)) return el;
  if (el instanceof HTMLInputElement && el.getAttribute('role') === 'combobox' && el.readOnly) return el;
  return null;
}

export function isDatePicker(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && el.closest(PICKER) !== null;
}

export function formItemLabel(el: HTMLElement): string {
  const item = el.closest(FORM_ITEM);
  if (!item || item.querySelectorAll('input, select, textarea').length > MAX_ITEM_CONTROLS) return '';
  const label = item.querySelector(FORM_ITEM_LABEL);
  const text = clean(label?.textContent);
  return text.length <= MAX_LABEL ? text : '';
}

/** 区间选择器（两个输入框共用一个表单项标签）：用"标签 + 占位文字"区分开始和结束。 */
export function pickerLabel(el: HTMLInputElement, baseLabel: string): string {
  const picker = el.closest(PICKER);
  const inputs = picker ? picker.querySelectorAll('input').length : 1;
  return inputs > 1 && el.placeholder ? `${baseLabel} ${el.placeholder}`.trim() : baseLabel;
}

export const ARIA_TRIGGER_SELECTOR = ARIA_TRIGGER;
