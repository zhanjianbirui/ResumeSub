import type { FieldDescriptor } from '@/shared/autofill-types';
import {
  AUTOCOMPLETE, type FieldPath, GLOBAL_RULES, RESUME_FILE, SECTION_KEYS, SECTION_PATTERNS, SECTION_RULES,
  type SectionGroup, SKIP,
} from './rules';

export type { FieldPath, SectionGroup } from './rules';

const cleanLabel = (label: string) => label.replace(/[*＊:：]/g, '').trim();
const normKey = (text: string) => cleanLabel(text).toLowerCase().replace(/\s+/g, '');

export function sectionGroupOf(text: string): SectionGroup | null {
  return SECTION_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** 返回 undefined 表示没有规则命中；返回 null 表示命中了"明确不填写"的规则。 */
function matchText(text: string, desc: FieldDescriptor): FieldPath | null | undefined {
  if (!text.trim()) return undefined;
  const hit = GLOBAL_RULES.find(([, re]) => re.test(text));
  if (hit) return hit[0];
  const group = sectionGroupOf(desc.section) ?? sectionGroupOf(desc.label);
  const sectionHit = SECTION_RULES.find(([, re]) => re.test(text));
  if (group && sectionHit && SECTION_KEYS[group].includes(sectionHit[0])) {
    return `${group}.${sectionHit[0]}` as FieldPath;
  }
  return undefined;
}

function autocompletePath(autocomplete: string): FieldPath | undefined {
  const token = autocomplete.trim().toLowerCase().split(/\s+/).pop() ?? '';
  return AUTOCOMPLETE[token];
}

export function matchField(desc: FieldDescriptor, customKeys: readonly string[]): FieldPath | null {
  const secondary = `${desc.placeholder} ${desc.name} ${desc.id}`;
  if (desc.kind === 'file') return RESUME_FILE.test(`${desc.label} ${secondary}`) ? 'resume.file' : null;
  if (SKIP.test(`${desc.label} ${secondary}`)) return null;
  const labelKey = normKey(desc.label);
  const custom = labelKey ? customKeys.find((key) => normKey(key) === labelKey) : undefined;
  if (custom) return `custom:${custom}`;
  const auto = autocompletePath(desc.autocomplete);
  if (auto) return auto;
  const primary = matchText(cleanLabel(desc.label), desc);
  if (primary !== undefined) return primary;
  return matchText(secondary, desc) ?? null;
}
