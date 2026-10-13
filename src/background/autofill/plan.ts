import type { EntryGroup, FieldDescriptor, FillInstruction } from '@/shared/autofill-types';
import type { VaultData } from '@/shared/schema/vault-data';
import { matchField } from './match';
import { chooseOption, synonymsFor } from './options';
import type { FieldPath } from './rules';
import { displayValue, resolveValue } from './values';

const CJK = /[㐀-鿿]/;
const GROUPS: readonly EntryGroup[] = ['education', 'experience', 'projects'];
const groupOf = (path: FieldPath): EntryGroup | undefined => GROUPS.find((g) => path.startsWith(`${g}.`));

export function entryCounts(data: VaultData): Record<EntryGroup, number> {
  const { education, experience, projects } = data.profile;
  return { education: education.length, experience: experience.length, projects: projects.length };
}

function buildValueFill(field: FieldDescriptor, path: FieldPath, index: number, data: VaultData): FillInstruction | null {
  if (path === 'resume.file') return data.resumeFile ? { signature: field.signature, file: data.resumeFile } : null;
  const english = !CJK.test(field.label) && field.label.trim() !== '';
  const raw = resolveValue(path, data.profile, { index, english, field });
  if (!raw) return null;
  if (field.kind === 'combobox') {
    const display = displayValue(path, raw, english);
    return { signature: field.signature, value: display, candidates: [display, ...synonymsFor(path, raw)].filter((v, i, a) => a.indexOf(v) === i) };
  }
  if (field.kind === 'select' || field.kind === 'radio') {
    const chosen = chooseOption(field.options ?? [], synonymsFor(path, raw));
    return chosen === null ? null : { signature: field.signature, value: chosen };
  }
  return { signature: field.signature, value: displayValue(path, raw, english) };
}

function buildFill(field: FieldDescriptor, path: FieldPath, index: number, data: VaultData): FillInstruction | null {
  const fill = buildValueFill(field, path, index, data);
  const group = groupOf(path);
  return fill && !fill.file && group ? { ...fill, group } : fill;
}

/** 字段在第 k 个重复区块（repeatIndex）中时取第 k 条记录，用来处理多段教育或实习区块。 */
export function planFills(fields: readonly FieldDescriptor[], data: VaultData): FillInstruction[] {
  const customKeys = Object.keys(data.profile.custom);
  const fills: FillInstruction[] = [];
  let resumeUsed = false; // 简历文件每次最多填一个上传框
  for (const field of fields) {
    const path = matchField(field, customKeys);
    if (!path || (path === 'resume.file' && resumeUsed)) continue;
    const fill = buildFill(field, path, field.repeatIndex, data);
    if (!fill) continue;
    fills.push(fill);
    if (path === 'resume.file') resumeUsed = true;
  }
  return fills;
}
