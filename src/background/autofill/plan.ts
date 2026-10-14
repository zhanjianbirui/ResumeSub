import type { EntryGroup, FieldDescriptor, FillInstruction } from '@/shared/autofill-types';
import type { VaultData } from '@/shared/schema/vault-data';
import { classifyField } from './match';
import type { ChatFn, LlmConfig } from '../llm/client';
import { mapFieldsWithLlm, memoryKey, PATH_DESCRIPTIONS } from '../llm/map-fields';
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

interface RulePass {
  fills: FillInstruction[];
  /** 规则没认出来、可以交给记忆或大模型的字段。 */
  unresolved: FieldDescriptor[];
}

function rulePass(fields: readonly FieldDescriptor[], data: VaultData): RulePass {
  const customKeys = Object.keys(data.profile.custom);
  const fills: FillInstruction[] = [];
  const unresolved: FieldDescriptor[] = [];
  let resumeUsed = false; // 简历文件每次最多填一个上传框
  for (const field of fields) {
    const path = classifyField(field, customKeys);
    if (path === null) unresolved.push(field);
    if (path === null || path === 'skip' || (path === 'resume.file' && resumeUsed)) continue;
    const fill = buildFill(field, path, field.repeatIndex, data);
    if (!fill) continue;
    fills.push(fill);
    if (path === 'resume.file') resumeUsed = true;
  }
  return { fills, unresolved };
}

/** 字段在第 k 个重复区块（repeatIndex）中时取第 k 条记录，用来处理多段教育或实习区块。 */
export function planFills(fields: readonly FieldDescriptor[], data: VaultData): FillInstruction[] {
  return rulePass(fields, data).fills;
}

export interface FallbackDeps {
  /** 本网站已学到的映射（记忆键 → 档案字段）。 */
  memory: Readonly<Record<string, string>>;
  /** 已配置并启用的大模型；未配置时只用规则和记忆。 */
  llm?: { cfg: LlmConfig; chat: ChatFn };
  onLlmError?(error: unknown): void;
}

export interface FallbackResult {
  fills: FillInstruction[];
  /** 大模型新学到、需要写回记忆的映射。 */
  learned: Record<string, string>;
}

const isKnownPath = (path: string, data: VaultData): path is FieldPath =>
  path in PATH_DESCRIPTIONS || (path.startsWith('custom:') && path.slice(7) in data.profile.custom);

function withSource(fill: FillInstruction | null, source: 'memory' | 'llm'): FillInstruction | null {
  return fill ? { ...fill, source } : null;
}

async function llmFills(fields: readonly FieldDescriptor[], data: VaultData, deps: FallbackDeps): Promise<FallbackResult> {
  if (!deps.llm || fields.length === 0) return { fills: [], learned: {} };
  try {
    const mapped = await mapFieldsWithLlm(fields, Object.keys(data.profile.custom), deps.llm.cfg, deps.llm.chat);
    const fills: FillInstruction[] = [];
    const learned: Record<string, string> = {};
    for (const [i, path] of mapped) {
      const field = fields[i];
      if (!field) continue;
      learned[memoryKey(field)] = path;
      const fill = withSource(buildFill(field, path, field.repeatIndex, data), 'llm');
      if (fill) fills.push(fill);
    }
    return { fills, learned };
  } catch (error) {
    deps.onLlmError?.(error);
    return { fills: [], learned: {} };
  }
}

/** 规则 → 本网站的映射记忆 → 大模型兜底（只发送字段描述，不发送档案内容）。 */
export async function planWithFallback(
  fields: readonly FieldDescriptor[],
  data: VaultData,
  deps: FallbackDeps,
): Promise<FallbackResult> {
  const { fills, unresolved } = rulePass(fields, data);
  const fromMemory: FillInstruction[] = [];
  const remaining: FieldDescriptor[] = [];
  for (const field of unresolved) {
    const remembered = deps.memory[memoryKey(field)];
    if (remembered && isKnownPath(remembered, data)) {
      const fill = withSource(buildFill(field, remembered, field.repeatIndex, data), 'memory');
      if (fill) fromMemory.push(fill);
    } else {
      remaining.push(field);
    }
  }
  const llm = await llmFills(remaining, data, deps);
  return { fills: [...fills, ...fromMemory, ...llm.fills], learned: llm.learned };
}
