import type { FillInstruction, ResumeFileLike } from '@/shared/autofill-types';
import { fillCombobox } from './combobox';
import { fillDatePicker } from './datepicker';
import { setNativeValue } from './native';
import { radioGroup } from './radio';
import type { ScannedField } from './scan';
import { hasSelection } from './widgets';

export { setNativeValue };

export type FillOutcome = 'filled' | 'skipped' | 'failed';

export interface FillDeps {
  makeDataTransfer?: () => DataTransfer;
}

/** 异步填写器（自定义下拉框、日期选择器）需要的环境：等待函数和每个控件最长等待时间。 */
export interface FillContext {
  doc: Document;
  wait(ms: number): Promise<void>;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

export function defaultContext(doc: Document): FillContext {
  return { doc, wait: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)), timeoutMs: DEFAULT_TIMEOUT_MS };
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PLACEHOLDER_OPTION = /^(?:请选择|select|choose|--|-|—)/i;
/** 浏览器会把这些类型里不合法的值清空，填完要回读确认。 */
const STRICT_TYPES = new Set(['date', 'month', 'number']);

function fire(el: HTMLElement, ...types: string[]) {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): FillOutcome {
  if (el.value.trim() !== '') return 'skipped';
  setNativeValue(el, value);
  if (STRICT_TYPES.has(el.type) && el.value !== value) return 'failed';
  fire(el, 'input', 'change');
  return 'filled';
}

/** 只有"请选择"一类占位项、空值项、禁用或隐藏项被选中时才算空；默认选中的真实选项（如"中国"）视为已填。 */
function selectIsEmpty(el: HTMLSelectElement): boolean {
  const selected = el.selectedIndex >= 0 ? el.options[el.selectedIndex] : undefined;
  if (!selected) return true;
  return selected.value === '' || selected.disabled || selected.hidden !== false || PLACEHOLDER_OPTION.test(selected.text.trim());
}

/** 控件当前是否已有值（文本非空、下拉非占位、自定义下拉已选、单选组已选、文件已选）。 */
export function hasValue(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement) return !selectIsEmpty(el);
  if (el instanceof HTMLTextAreaElement) return el.value.trim() !== '';
  if (!(el instanceof HTMLInputElement)) return hasSelection(el);
  if (el.type === 'radio') return radioGroup(el).some((r) => r.checked);
  if (el.type === 'file') return (el.files?.length ?? 0) > 0;
  return el.value.trim() !== '';
}

function fillSelect(el: HTMLSelectElement, value: string): FillOutcome {
  if (!selectIsEmpty(el)) return 'skipped';
  if (!Array.from(el.options).some((o) => o.value === value)) return 'failed';
  setNativeValue(el, value);
  fire(el, 'input', 'change');
  return 'filled';
}

function fillRadio(el: HTMLInputElement, value: string): FillOutcome {
  const group = radioGroup(el);
  if (group.some((r) => r.checked)) return 'skipped';
  const target = group.find((r) => r.value === value);
  if (!target) return 'failed';
  target.click();
  return 'filled';
}

function decode(file: ResumeFileLike): File | null {
  if (!BASE64.test(file.dataBase64)) return null;
  try {
    const binary = atob(file.dataBase64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new File([bytes], file.name, { type: file.mime });
  } catch {
    return null;
  }
}

function fillFile(el: HTMLInputElement, file: ResumeFileLike, deps: FillDeps): FillOutcome {
  if (el.files && el.files.length > 0) return 'skipped';
  const decoded = decode(file);
  if (!decoded) return 'failed';
  const transfer = (deps.makeDataTransfer ?? (() => new DataTransfer()))();
  transfer.items.add(decoded);
  el.files = transfer.files;
  fire(el, 'input', 'change');
  return 'filled';
}

function fillSync(field: ScannedField, fill: FillInstruction, deps: FillDeps): FillOutcome {
  const el = field.element;
  const kind = field.descriptor.kind;
  if (kind === 'file') return fill.file ? fillFile(el as HTMLInputElement, fill.file, deps) : 'failed';
  if (fill.value === undefined) return 'failed';
  if (kind === 'radio') return fillRadio(el as HTMLInputElement, fill.value);
  if (el instanceof HTMLSelectElement) return fillSelect(el, fill.value);
  return fillText(el as HTMLInputElement, fill.value);
}

/** 按控件类型填写；自定义下拉框和日期选择器需要等待组件渲染，所以整体是异步的。 */
export async function applyFill(
  field: ScannedField,
  fill: FillInstruction,
  options: Partial<FillContext> & FillDeps = {},
): Promise<FillOutcome> {
  const kind = field.descriptor.kind;
  const ctx: FillContext = { ...defaultContext(field.element.ownerDocument), ...options };
  try {
    if (kind === 'combobox') return await fillCombobox(field.element, fill, ctx);
    if (kind === 'datepicker') {
      return fill.value ? await fillDatePicker(field.element as HTMLInputElement, fill.value, ctx) : 'failed';
    }
    return fillSync(field, fill, options);
  } catch (error) {
    console.warn('[ResumeSub] fill failed', field.descriptor.label, error);
    return 'failed';
  }
}
