import type { FillInstruction, ResumeFileLike } from '@/shared/autofill-types';
import { radioGroup } from './radio';
import type { ScannedField } from './scan';

export type FillOutcome = 'filled' | 'skipped' | 'failed';

interface FillDeps {
  makeDataTransfer?: () => DataTransfer;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const PLACEHOLDER_OPTION = /^(?:请选择|select|choose|--|-|—)/i;
/** 浏览器会把这些类型里不合法的值清空，填完要回读确认。 */
const STRICT_TYPES = new Set(['date', 'month', 'number']);

function fire(el: HTMLElement, ...types: string[]) {
  for (const type of types) el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** 必须用原型上的 setter，React、Vue 才能察觉值的变化。 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
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

export function applyFill(field: ScannedField, fill: FillInstruction, deps: FillDeps = {}): FillOutcome {
  const el = field.element;
  const kind = field.descriptor.kind;
  try {
    if (kind === 'file') return fill.file ? fillFile(el as HTMLInputElement, fill.file, deps) : 'failed';
    if (fill.value === undefined) return 'failed';
    if (kind === 'radio') return fillRadio(el as HTMLInputElement, fill.value);
    if (el instanceof HTMLSelectElement) return fillSelect(el, fill.value);
    return fillText(el as HTMLInputElement, fill.value);
  } catch (error) {
    console.warn('[ResumeSub] fill failed', field.descriptor.label, error);
    return 'failed';
  }
}
