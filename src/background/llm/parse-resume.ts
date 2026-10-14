import * as v from 'valibot';
import { detectDegree } from '@/parser/degree';
import { emptyProfile, type Profile, ProfileSchema } from '@/shared/schema/profile';
import { type ChatFn, extractJson, type LlmConfig, LlmError } from './client';

export const MAX_RESUME_TEXT = 60_000;

const SYSTEM = [
  '你是简历解析助手。把用户给的简历原文整理成 JSON，只输出 JSON，不要解释。结构：',
  '{"basic":{"name","nameEn","phone","email","gender":"male|female|","birthDate":"YYYY-MM-DD 或空","hometown","politicalStatus","currentCity","linkedin","github","website"},',
  '"education":[{"school","schoolEn","degree":"本科/硕士/博士/大专/高中","major","start":"YYYY-MM","end":"YYYY-MM 或 present","gpa","rank","courses","city","country"}],',
  '"experience":[{"company","title","start","end","type":"intern|fulltime","location","bullets":[字符串]}],',
  '"projects":[{"name","role","start","end","tech":[字符串],"bullets":[字符串]}],',
  '"skills":{"languages":[编程语言],"frameworks":[框架/库],"tools":[工具],"langCerts":[语言能力与证书]},',
  '"awards":[{"name","date":"YYYY-MM 或空","level"}]}。',
  '原文没有的信息留空字符串或空数组，不要编造；日期统一成 YYYY-MM；"至今"写 present。',
].join('');

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj => (typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '');
const strs = (x: unknown): string[] => arr(x).map(str).filter(Boolean);
const opt = (x: unknown): string | undefined => str(x) || undefined;

/** 把各种写法的年月统一成 YYYY-MM / present，无法识别时返回空串（保证通过 schema）。 */
export function normalizeMonth(x: unknown): string {
  const s = str(x);
  if (/^(present|now|current|至今|现在)$/i.test(s)) return 'present';
  const m = /^(\d{4})\D{0,2}(\d{1,2})/.exec(s);
  if (!m) return '';
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${String(month).padStart(2, '0')}` : '';
}

function normalizeDate(x: unknown): string | undefined {
  const m = /^(\d{4})\D(\d{1,2})\D(\d{1,2})/.exec(str(x));
  if (!m) return undefined;
  return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
}

function gender(x: unknown): string | undefined {
  const s = str(x).toLowerCase();
  if (s === 'male' || s === '男') return 'male';
  if (s === 'female' || s === '女') return 'female';
  return undefined;
}

function basicOf(raw: Obj): Profile['basic'] {
  return {
    name: str(raw.name), nameEn: opt(raw.nameEn), phone: str(raw.phone), email: str(raw.email), gender: gender(raw.gender),
    birthDate: normalizeDate(raw.birthDate), hometown: opt(raw.hometown), politicalStatus: opt(raw.politicalStatus),
    currentCity: opt(raw.currentCity), linkedin: opt(raw.linkedin), github: opt(raw.github), website: opt(raw.website),
  };
}

/** 模型输出不可信：逐字段挑出认识的内容并转换格式，最后再用档案 schema 校验一遍。 */
export function sanitizeProfile(raw: unknown): Profile {
  const r = obj(raw);
  const skills = obj(r.skills);
  const profile: Profile = {
    ...emptyProfile(),
    basic: basicOf(obj(r.basic)),
    education: arr(r.education).map(obj).map((e) => ({
      school: str(e.school), schoolEn: opt(e.schoolEn), degree: detectDegree(str(e.degree)), major: str(e.major),
      start: normalizeMonth(e.start), end: normalizeMonth(e.end), gpa: opt(e.gpa), rank: opt(e.rank),
      courses: opt(e.courses), city: opt(e.city), country: opt(e.country),
    })),
    experience: arr(r.experience).map(obj).map((e) => ({
      company: str(e.company), title: str(e.title), start: normalizeMonth(e.start), end: normalizeMonth(e.end),
      type: str(e.type) === 'fulltime' ? 'fulltime' as const : 'intern' as const, location: opt(e.location), bullets: strs(e.bullets),
    })),
    projects: arr(r.projects).map(obj).map((p) => ({
      name: str(p.name), role: opt(p.role), start: normalizeMonth(p.start), end: normalizeMonth(p.end),
      tech: strs(p.tech), bullets: strs(p.bullets),
    })),
    skills: { languages: strs(skills.languages), frameworks: strs(skills.frameworks), tools: strs(skills.tools), langCerts: strs(skills.langCerts) },
    awards: arr(r.awards).map(obj).map((a) => ({ name: str(a.name), date: normalizeMonth(a.date) || undefined, level: opt(a.level) })),
  };
  const result = v.safeParse(ProfileSchema, profile);
  if (!result.success) throw new LlmError('BAD_RESPONSE');
  return result.output;
}

/** 只在用户点击"用 AI 解析"时调用：会把简历全文发给所配置的模型。 */
export async function parseResumeWithLlm(text: string, cfg: LlmConfig, chat: ChatFn): Promise<Profile> {
  const reply = await chat(cfg, { system: SYSTEM, user: text.slice(0, MAX_RESUME_TEXT), effort: 'medium', maxTokens: 16000 });
  return sanitizeProfile(extractJson(reply));
}
