import type { FieldDescriptor, FieldKind, FieldOption } from '@/shared/autofill-types';
import { resolveLabel, sectionOf } from './label';
import { radioGroup, radioGroupLabel } from './radio';
import { createRepeatCache, repeatIndexOf } from './repeat';
import { fnv1a } from './signature';
import {
  ARIA_TRIGGER_SELECTOR, comboboxRoot, inPickerPanel, isDatePicker, isDisabledWidget, pickerLabel, pickerRoot,
} from './widgets';
import { isFileReachable, isVisible, layoutAvailable } from './visibility';

export interface ScannedField {
  descriptor: FieldDescriptor;
  element: HTMLElement;
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'checkbox', 'search', 'color', 'range']);
const INPUT_KINDS: Readonly<Record<string, FieldKind>> = {
  email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'date', month: 'month', file: 'file', radio: 'radio',
};
const CONTROL_SELECTOR = `input, select, textarea, ${ARIA_TRIGGER_SELECTOR}`;
const OPEN_QUESTION = /为什么|请描述|请简述|请介绍|谈谈|自我评价|自我介绍|[?？]|\bwhy\b|describe|tell us|cover letter/i;
const MAX_TEXT = 200;
/** 与 shared/autofill-schema 的 MAX_FIELDS / MAX_OPTIONS 一致（content 不引入 valibot，这里复制数值）。 */
const MAX_FIELDS = 300;
const MAX_OPTIONS = 200;

function kindOf(el: HTMLElement): FieldKind | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return null;
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const type = (el as HTMLInputElement).type.toLowerCase();
  if (SKIP_TYPES.has(type)) return null;
  return INPUT_KINDS[type] ?? 'text';
}

function isUsable(el: HTMLElement, kind: FieldKind, layout: boolean): boolean {
  const control = el as HTMLInputElement;
  if (control.disabled || control.readOnly) return false;
  return kind === 'file' ? isFileReachable(control, layout) : isVisible(el, layout);
}

const cut = (text: string) => text.slice(0, MAX_TEXT);

function radioOptions(group: readonly HTMLInputElement[]): FieldOption[] {
  return group.slice(0, MAX_OPTIONS).map((radio) => ({ value: cut(radio.value), label: cut(resolveLabel(radio)) }));
}

function selectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options).slice(0, MAX_OPTIONS).map((o) => ({ value: cut(o.value), label: cut(o.text.trim()) }));
}

type Draft = Omit<FieldDescriptor, 'signature' | 'repeatIndex'>;

function describe(el: HTMLElement, kind: FieldKind, label: string, options?: FieldOption[]): Draft {
  const input = el as HTMLInputElement;
  return {
    kind, label: cut(label), name: cut(input.name ?? ''), id: cut(el.id), placeholder: cut(input.placeholder ?? ''),
    autocomplete: cut(el.getAttribute('autocomplete') ?? ''), section: cut(sectionOf(el)), ...(options ? { options } : {}),
  };
}

/** 返回 null 表示这个控件不作为独立字段上报（已处理过的单选组成员、开放式问答框）。 */
function draftFor(el: HTMLElement, kind: FieldKind, seenRadios: Set<HTMLInputElement>): Draft | null {
  if (kind === 'radio') {
    const radio = el as HTMLInputElement;
    if (!radio.name || seenRadios.has(radio)) return null;
    const group = radioGroup(radio);
    group.forEach((r) => seenRadios.add(r));
    return describe(el, 'radio', radioGroupLabel(group), radioOptions(group));
  }
  const label = resolveLabel(el);
  if (kind === 'textarea' && OPEN_QUESTION.test(label)) return null;
  return describe(el, kind, label, el instanceof HTMLSelectElement ? selectOptions(el) : undefined);
}

interface Widget {
  kind: FieldKind;
  element: HTMLElement;
  draft: Draft;
}

/** 自定义下拉框或日期选择器；不是这两类时返回 null，由普通控件逻辑处理。 */
function widgetOf(el: HTMLElement, layout: boolean, seenRoots: Set<HTMLElement>): Widget | 'skip' | null {
  if (inPickerPanel(el)) return 'skip';
  const root = comboboxRoot(el);
  if (root) {
    if (seenRoots.has(root)) return 'skip';
    seenRoots.add(root);
    if (isDisabledWidget(root) || !isVisible(root, layout)) return 'skip';
    return { kind: 'combobox', element: root, draft: describe(root, 'combobox', resolveLabel(root) || resolveLabel(el)) };
  }
  if (isDatePicker(el)) {
    const input = el as HTMLInputElement;
    const picker = pickerRoot(el);
    if (input.disabled || (picker && isDisabledWidget(picker)) || !isVisible(el, layout)) return 'skip';
    return { kind: 'datepicker', element: el, draft: describe(el, 'datepicker', pickerLabel(input, resolveLabel(el))) };
  }
  return null;
}

function ordinaryOf(el: HTMLElement, layout: boolean, seenRadios: Set<HTMLInputElement>): Widget | null {
  const kind = kindOf(el);
  if (!kind || !isUsable(el, kind, layout)) return null;
  const draft = draftFor(el, kind, seenRadios);
  return draft ? { kind, element: el, draft } : null;
}

export function scanFields(root: ParentNode): ScannedField[] {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const layout = layoutAvailable(doc);
  const seenRadios = new Set<HTMLInputElement>();
  const seenRoots = new Set<HTMLElement>();
  const counts = new Map<string, number>();
  const repeatCache = createRepeatCache();
  const result: ScannedField[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))) {
    if (result.length >= MAX_FIELDS) break;
    const found = widgetOf(el, layout, seenRoots);
    if (found === 'skip') continue;
    const widget = found ?? ordinaryOf(el, layout, seenRadios);
    if (!widget) continue;
    const { draft } = widget;
    const repeatIndex = repeatIndexOf(widget.element, draft.label, repeatCache);
    const base = fnv1a(`${draft.label}|${draft.name}|${draft.id}|${draft.section}|${repeatIndex}`);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    result.push({ descriptor: { ...draft, repeatIndex, signature: `${base}-${occurrence}` }, element: widget.element });
  }
  return result;
}
