import * as v from 'valibot';
import type { FieldDescriptor } from '@/shared/autofill-types';
import { sectionGroupOf } from '../autofill/match';
import type { FieldPath } from '../autofill/rules';
import { type ChatFn, extractJson, type LlmConfig, LlmError } from './client';

/** 可以交给模型选择的档案字段（只有字段名和说明，不含任何值）。 */
export const PATH_DESCRIPTIONS: Readonly<Record<string, string>> = {
  'basic.name': '姓名（全名）', 'basic.nameFirst': '名（不含姓）', 'basic.nameLast': '姓', 'basic.nameEn': '英文名',
  'basic.phone': '手机号', 'basic.email': '邮箱', 'basic.gender': '性别', 'basic.birthDate': '出生日期',
  'basic.idType': '证件类型', 'basic.idNumber': '本人证件号码（身份证/护照号）', 'basic.nationality': '国籍',
  'basic.hometown': '籍贯/户口所在地/出生地', 'basic.politicalStatus': '政治面貌', 'basic.currentCity': '现居城市',
  'basic.address': '本人通讯地址', 'basic.linkedin': 'LinkedIn 链接', 'basic.github': 'GitHub 链接', 'basic.website': '个人网站',
  'education.school': '学校名称', 'education.major': '专业', 'education.degree': '学历/学位', 'education.start': '入学时间',
  'education.end': '毕业时间', 'education.gpa': 'GPA/绩点', 'education.rank': '专业排名',
  'experience.company': '实习/工作单位', 'experience.title': '职位名称', 'experience.start': '工作开始时间',
  'experience.end': '工作结束时间', 'experience.description': '工作内容描述', 'experience.location': '工作地点',
  'projects.name': '项目名称', 'projects.role': '项目角色', 'projects.start': '项目开始时间', 'projects.end': '项目结束时间',
  'projects.description': '项目描述', 'preferences.expectedCities': '期望工作城市', 'preferences.expectedSalary': '期望薪资',
  'preferences.availableFrom': '最早到岗时间', 'skills.all': '技能列表',
};

/** 敏感字段要求更高的置信度，宁可不填也不能填错位置。 */
const SENSITIVE = new Set(['basic.idNumber', 'basic.birthDate', 'basic.address', 'basic.phone', 'basic.email']);
export const MIN_CONFIDENCE = 0.7;
const MIN_SENSITIVE_CONFIDENCE = 0.9;
export const MAX_LLM_FIELDS = 60;
const MAX_OPTIONS_SHOWN = 15;

const SYSTEM = [
  '你是网申表单的字段识别助手。给你一组表单字段（标签、提示文字、类型、所在区块、部分选项）和候选档案字段列表，',
  '判断每个表单字段应当用候选列表中的哪一个来填写。只能从候选列表里选；拿不准、或字段问的是他人信息（紧急联系人、家属、推荐人等）、',
  '开放式问答、同意条款、验证码时，path 写 null。只输出 JSON：{"mappings":[{"i":字段序号,"path":"候选键或null","confidence":0到1}]}，不要解释。',
].join('');

const ResultSchema = v.object({
  mappings: v.array(v.object({
    i: v.number(),
    path: v.nullable(v.string()),
    confidence: v.optional(v.number(), 0),
  })),
});

const MAX_KEY = 200;
const norm = (text: string) => text.replace(/[*＊:：\s]/g, '').toLowerCase();

/** 映射记忆的键：同一网站上"类型 + 标签 + 所属区块"相同的字段视为同一个字段。 */
export function memoryKey(desc: FieldDescriptor): string {
  return `${desc.kind}|${norm(desc.label || desc.placeholder || desc.name)}|${sectionGroupOf(desc.section) ?? ''}`.slice(0, MAX_KEY);
}

function candidates(customKeys: readonly string[]): Record<string, string> {
  const custom = Object.fromEntries(customKeys.map((k) => [`custom:${k}`, `自定义：${k}`]));
  return { ...PATH_DESCRIPTIONS, ...custom };
}

function describeFields(fields: readonly FieldDescriptor[]) {
  return fields.map((f, i) => ({
    i, label: f.label, placeholder: f.placeholder || undefined, type: f.kind, section: f.section || undefined,
    options: f.options?.slice(0, MAX_OPTIONS_SHOWN).map((o) => o.label).filter(Boolean),
  }));
}

/**
 * 用大模型给规则没认出的字段选档案字段。发送内容只有表单字段的描述和候选键名，绝不包含档案里的值。
 * 返回 字段序号 → 档案字段。
 */
export async function mapFieldsWithLlm(
  fields: readonly FieldDescriptor[],
  customKeys: readonly string[],
  cfg: LlmConfig,
  chat: ChatFn,
): Promise<Map<number, FieldPath>> {
  const batch = fields.slice(0, MAX_LLM_FIELDS);
  if (batch.length === 0) return new Map();
  const allowed = candidates(customKeys);
  const user = JSON.stringify({ candidates: allowed, fields: describeFields(batch) });
  const text = await chat(cfg, { system: SYSTEM, user, effort: 'low', maxTokens: 4000 });
  const parsed = v.safeParse(ResultSchema, extractJson(text));
  if (!parsed.success) throw new LlmError('BAD_RESPONSE');
  const result = new Map<number, FieldPath>();
  for (const { i, path, confidence } of parsed.output.mappings) {
    if (path === null || !(path in allowed) || !batch[i]) continue;
    const need = SENSITIVE.has(path) ? MIN_SENSITIVE_CONFIDENCE : MIN_CONFIDENCE;
    if (confidence >= need) result.set(i, path as FieldPath);
  }
  return result;
}
