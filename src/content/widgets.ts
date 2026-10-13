import { clean, textOutsideControls } from './text';

const SELECT_ROOT = '.ant-select, .el-select';
const ARIA_TRIGGER = '[role="combobox"]:not(input), button[aria-haspopup="listbox"]';
const PICKER = '.ant-picker, .el-date-editor, .datepicker, .date-picker';
/** Element Plus 展开后的日期面板里也有 .el-date-editor 输入框（时间、年月切换），它们不是表单字段。 */
const PICKER_PANEL = '.el-picker-panel, .el-date-picker';
const TEXT_TYPES = new Set(['text', 'search', 'tel']);
const DISABLED = '.ant-select-disabled, .ant-picker-disabled, .is-disabled, [aria-disabled="true"]';
const INNER_DISABLED = '.el-select__wrapper.is-disabled, .el-input.is-disabled, input:disabled';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item';
/** 表单项里的控件多于 2 个时，说明它是包住多个字段的外层容器，不能当作单个字段的标签来源。 */
const MAX_ITEM_CONTROLS = 2;
const ITEM_CONTROLS = 'input:not([type="hidden"]), select, textarea';
const FRAMEWORK_LABEL = '.ant-form-item-label, .el-form-item__label';
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
  // ARIA 1.0 写法是 div[role=combobox] 包住输入框：内层输入框归到外层根节点，不单独上报。
  const aria = el.closest<HTMLElement>(ARIA_TRIGGER);
  if (aria) return aria;
  if (el instanceof HTMLInputElement && el.getAttribute('role') === 'combobox' && el.readOnly) return el;
  return null;
}

/** 自定义下拉框或日期选择器根节点（或其内部输入框）处于禁用状态。 */
export function isDisabledWidget(root: HTMLElement): boolean {
  if (root.matches(DISABLED)) return true;
  if ((root as HTMLButtonElement | HTMLInputElement).disabled === true) return true;
  return root.querySelector(INNER_DISABLED) !== null;
}

/** 输入框位于展开的日期面板内（面板头部的年月、时间输入框）。 */
export const inPickerPanel = (el: HTMLElement): boolean => el.closest(PICKER_PANEL) !== null;

export function isDatePicker(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && TEXT_TYPES.has(el.type) && el.closest(PICKER) !== null && !inPickerPanel(el);
}

export const pickerRoot = (el: HTMLElement): HTMLElement | null => el.closest<HTMLElement>(PICKER);

const owns = (el: HTMLElement, node: Element | null) => node !== null && (node === el || el.contains(node));

/** 普通 label 只有在 el 是表单项里唯一的控件、并且 label 没有指向别的控件时才可用。 */
function plainLabel(item: Element, el: HTMLElement, controls: readonly Element[]): HTMLLabelElement | null {
  if (!controls.every((c) => owns(el, c))) return null;
  const label = item.querySelector('label');
  if (!label) return null;
  return !label.htmlFor || owns(el, el.ownerDocument.getElementById(label.htmlFor)) ? label : null;
}

export function formItemLabel(el: HTMLElement): string {
  const item = el.closest(FORM_ITEM);
  if (!item) return '';
  const controls = Array.from(item.querySelectorAll(ITEM_CONTROLS));
  if (controls.length > MAX_ITEM_CONTROLS) return '';
  const label = item.querySelector(FRAMEWORK_LABEL) ?? plainLabel(item, el, controls);
  const text = label ? textOutsideControls(label) : '';
  return text.length <= MAX_LABEL ? text : '';
}

/** 区间选择器（两个输入框共用一个表单项标签）：用"标签 + 占位文字"区分开始和结束。 */
export function pickerLabel(el: HTMLInputElement, baseLabel: string): string {
  const picker = el.closest(PICKER);
  const inputs = picker ? picker.querySelectorAll('input').length : 1;
  return inputs > 1 && el.placeholder ? `${baseLabel} ${el.placeholder}`.trim() : baseLabel;
}

export const ARIA_TRIGGER_SELECTOR = ARIA_TRIGGER;
