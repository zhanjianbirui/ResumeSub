import type { FieldDescriptor, FieldKind, FieldOption } from '@/shared/autofill-types';
import { resolveLabel, sectionOf } from './label';
import { fnv1a } from './signature';

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

function kindOf(el: HTMLElement): FieldKind | null {
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const type = (el as HTMLInputElement).type.toLowerCase();
  if (SKIP_TYPES.has(type)) return null;
  return INPUT_KINDS[type] ?? 'text';
}

function isHidden(el: HTMLElement): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return true;
  const view = el.ownerDocument.defaultView;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
  }
  return false;
}

function isUsable(el: HTMLElement, kind: FieldKind): boolean {
  const control = el as HTMLInputElement;
  if (control.disabled || control.readOnly) return false;
  return kind === 'file' || !isHidden(el);
}

const cut = (text: string) => text.slice(0, MAX_TEXT);

function radioOptions(group: readonly HTMLInputElement[]): FieldOption[] {
  return group.map((radio) => ({ value: cut(radio.value), label: cut(resolveLabel(radio)) }));
}

function radioGroupLabel(group: readonly HTMLInputElement[]): string {
  const first = group[0];
  let container: HTMLElement | null = first?.parentElement ?? null;
  while (container && !group.every((r) => container?.contains(r))) container = container.parentElement;
  const holder = container?.parentElement && container.tagName === 'LABEL' ? container.parentElement : container;
  if (!holder) return '';
  const copy = holder.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('label, input').forEach((n) => n.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function describe(el: HTMLElement, kind: FieldKind, label: string, options?: FieldOption[]): Omit<FieldDescriptor, 'signature'> {
  const input = el as HTMLInputElement;
  return {
    kind, label: cut(label), name: cut(input.name ?? ''), id: cut(el.id), placeholder: cut(input.placeholder ?? ''),
    autocomplete: cut(el.getAttribute('autocomplete') ?? ''), section: cut(sectionOf(el)), ...(options ? { options } : {}),
  };
}

export function scanFields(root: ParentNode): ScannedField[] {
  const seenRadioGroups = new Set<string>();
  const counts = new Map<string, number>();
  const result: ScannedField[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('input, select, textarea'))) {
    const kind = kindOf(el);
    if (!kind || !isUsable(el, kind)) continue;
    let draft: Omit<FieldDescriptor, 'signature'>;
    if (kind === 'radio') {
      const name = (el as HTMLInputElement).name;
      if (!name || seenRadioGroups.has(name)) continue;
      seenRadioGroups.add(name);
      const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(name)}"]`));
      draft = describe(el, 'radio', radioGroupLabel(group), radioOptions(group));
    } else {
      const label = resolveLabel(el);
      if (kind === 'textarea' && OPEN_QUESTION.test(label)) continue;
      const options = el instanceof HTMLSelectElement
        ? Array.from(el.options).map((o) => ({ value: cut(o.value), label: cut(o.text.trim()) }))
        : undefined;
      draft = describe(el, kind, label, options);
    }
    const base = fnv1a(`${draft.label}|${draft.name}|${draft.id}|${draft.section}`);
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    result.push({ descriptor: { ...draft, signature: `${base}-${occurrence}` }, element: el });
  }
  return result;
}
