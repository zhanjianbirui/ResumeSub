import type { FieldDescriptor, FillInstruction } from '@/shared/autofill-types';
import type { VaultData } from '@/shared/schema/vault-data';
import { matchField } from './match';
import { chooseOption, synonymsFor } from './options';
import type { FieldPath } from './rules';
import { displayValue, resolveValue } from './values';

const CJK = /[㐀-鿿]/;

function buildFill(field: FieldDescriptor, path: FieldPath, index: number, data: VaultData): FillInstruction | null {
  if (path === 'resume.file') return data.resumeFile ? { signature: field.signature, file: data.resumeFile } : null;
  const english = !CJK.test(field.label) && field.label.trim() !== '';
  const raw = resolveValue(path, data.profile, { index, english, field });
  if (!raw) return null;
  if (field.kind === 'select' || field.kind === 'radio') {
    const chosen = chooseOption(field.options ?? [], synonymsFor(path, raw));
    return chosen === null ? null : { signature: field.signature, value: chosen };
  }
  return { signature: field.signature, value: displayValue(path, raw, english) };
}

/** 同一个 path 第 k 次出现时取第 k 条记录，用来处理多段教育或实习区块。 */
export function planFills(fields: readonly FieldDescriptor[], data: VaultData): FillInstruction[] {
  const customKeys = Object.keys(data.profile.custom);
  const counters = new Map<FieldPath, number>();
  const fills: FillInstruction[] = [];
  let resumeUsed = false; // 简历文件每次最多填一个上传框
  for (const field of fields) {
    const path = matchField(field, customKeys);
    if (!path || (path === 'resume.file' && resumeUsed)) continue;
    const index = counters.get(path) ?? 0;
    counters.set(path, index + 1);
    const fill = buildFill(field, path, index, data);
    if (!fill) continue;
    fills.push(fill);
    if (path === 'resume.file') resumeUsed = true;
  }
  return fills;
}
