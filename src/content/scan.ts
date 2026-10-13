import type { FieldDescriptor, FieldKind, FieldOption } from '@/shared/autofill-types';
import { resolveLabel, sectionOf } from './label';
import { radioGroup, radioGroupLabel } from './radio';
import { repeatIndexOf } from './repeat';
import { fnv1a } from './signature';
import { isFileReachable, isVisible, layoutAvailable } from './visibility';

export interface ScannedField {
  descriptor: FieldDescriptor;
  element: HTMLElement;
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'checkbox', 'search', 'color', 'range']);
const INPUT_KINDS: Readonly<Record<string, FieldKind>> = {
  email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'date', month: 'month', file: 'file', radio: 'radio',
};
const OPEN_QUESTION = /为什么|请描述|请简述|请介绍|谈谈|自我评价|自我介绍|[?？]|\bwhy\b|describe|tell us|cover letter/i;
const MAX_TEXT = 200;
/** 与 shared/autofill-schema 的 MAX_FIELDS / MAX_OPTIONS 一致（content 不引入 valibot，这里复制数值）。 */
const MAX_FIELDS = 300;
const MAX_OPTIONS = 200;

function kindOf(el: HTMLElement): FieldKind | null {
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

export function scanFields(root: ParentNode): ScannedField[] {
  const doc = (root as Node).ownerDocument ?? (root as Document);
  const layout = layoutAvailable(doc);
  const seenRadios = new Set<HTMLInputElement>();
  const counts = new Map<string, number>();
  const prints = new WeakMap<Element, string>();
  const result: ScannedField[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea'))) {
    if (result.length >= MAX_FIELDS) break;
    const kind = kindOf(el);
    if (!kind || !isUsable(el, kind, layout)) continue;
    const draft = draftFor(el, kind, seenRadios);
    if (!draft) continue;
    const repeatIndex = repeatIndexOf(el, prints);
    const base = fnv1a(`${draft.label}|${draft.name}|${draft.id}|${draft.section}|${repeatIndex}`);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    result.push({ descriptor: { ...draft, repeatIndex, signature: `${base}-${occurrence}` }, element: el });
  }
  return result;
}
