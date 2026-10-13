import type { FillInstruction, ResumeFileLike } from '@/shared/autofill-types';
import type { ScannedField } from './scan';

export type FillOutcome = 'filled' | 'skipped' | 'failed';

interface FillDeps {
  makeDataTransfer?: () => DataTransfer;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

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
  fire(el, 'input', 'change');
  return 'filled';
}

function fillSelect(el: HTMLSelectElement, value: string): FillOutcome {
  if (el.value !== '' && el.selectedIndex > 0) return 'skipped';
  if (!Array.from(el.options).some((o) => o.value === value)) return 'failed';
  setNativeValue(el, value);
  fire(el, 'input', 'change');
  return 'filled';
}

function fillRadio(el: HTMLInputElement, value: string, root: ParentNode): FillOutcome {
  const group = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter((r) => r.name === el.name);
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

export function applyFill(field: ScannedField, fill: FillInstruction, root: ParentNode, deps: FillDeps = {}): FillOutcome {
  const el = field.element;
  const kind = field.descriptor.kind;
  try {
    if (kind === 'file') return fill.file ? fillFile(el as HTMLInputElement, fill.file, deps) : 'failed';
    if (fill.value === undefined) return 'failed';
    if (kind === 'radio') return fillRadio(el as HTMLInputElement, fill.value, root);
    if (el instanceof HTMLSelectElement) return fillSelect(el, fill.value);
    return fillText(el as HTMLInputElement, fill.value);
  } catch (error) {
    console.warn('[ResumeSub] fill failed', field.descriptor.label, error);
    return 'failed';
  }
}
