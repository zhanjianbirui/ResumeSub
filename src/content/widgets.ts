import { clean } from './text';

const SELECT_ROOT = '.ant-select, .el-select';
const ARIA_TRIGGER = '[role="combobox"]:not(input), button[aria-haspopup="listbox"]';
const PICKER = '.ant-picker, .el-date-editor, [class*="date-picker"], [class*="datepicker"]';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item';
/** 表单项里的控件多于 2 个时，说明它是包住多个字段的外层容器，不能当作单个字段的标签来源。 */
const MAX_ITEM_CONTROLS = 2;
const FORM_ITEM_LABEL = '.ant-form-item-label, .el-form-item__label, label';
const MAX_LABEL = 60;
/** 触发按钮上的这些文字表示还没选（"Select One""请选择"）。 */
const UNSELECTED_TEXT = /^(?:select|choose|请选择|--)/i;
/** Element Plus 2.x 的占位元素：没有 is-transparent 时里面显示的是已选项。 */
const EL_SELECTED = '.el-select__placeholder:not(.is-transparent), .el-select__tags-text';

function triggerHasText(root: HTMLElement): boolean {
  if (root instanceof HTMLInputElement) return root.value.trim() !== '';
  const text = clean(root.textContent);
  return text !== '' && !UNSELECTED_TEXT.test(text);
}

/** 自定义下拉框是否已有选中项（Ant 选中项、Element Plus 已选文字/旧版输入框值、ARIA 触发按钮文字）。 */
export function hasSelection(root: HTMLElement): boolean {
  if (root.querySelector('.ant-select-selection-item')) return true;
  if (clean(root.querySelector(EL_SELECTED)?.textContent) !== '') return true;
  const input = root.querySelector<HTMLInputElement>('.el-input__inner, .el-select__input');
  if (input && input.value.trim() !== '') return true;
  return root.matches(ARIA_TRIGGER) || root.getAttribute('role') === 'combobox' ? triggerHasText(root) : false;
}

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
