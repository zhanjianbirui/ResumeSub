import type { FieldDescriptor } from '@/shared/autofill-types';
import type { Basic, Profile } from '@/shared/schema/profile';
import type { FieldPath } from './rules';

const COMPOUND_SURNAMES = [
  '欧阳', '司马', '诸葛', '上官', '东方', '皇甫', '尉迟', '公孙', '慕容', '长孙', '宇文', '司徒', '夏侯', '轩辕', '令狐', '端木',
];

export function splitName(basic: Basic, english: boolean): { first: string; last: string } {
  if (english && basic.nameEn?.trim()) {
    const parts = basic.nameEn.trim().split(/\s+/);
    return parts.length > 1
      ? { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] ?? '' }
      : { first: parts[0] ?? '', last: '' };
  }
  const name = basic.name.trim();
  const surname = COMPOUND_SURNAMES.find((s) => name.startsWith(s) && name.length > s.length) ?? name.slice(0, 1);
  return { last: surname, first: name.slice(surname.length) };
}

type DatePart = 'y' | 'm' | 'd';

interface DateFormat {
  order: readonly DatePart[];
  sep: string;
  cjk: boolean;
}

const ISO: DateFormat = { order: ['y', 'm', 'd'], sep: '-', cjk: false };
const SEPARATOR = /^[-/.]$/;
const CJK_SUFFIX: Readonly<Record<DatePart, string>> = { y: '年', m: '月', d: '日' };

/** 占位符里写了 YYYY/MM/DD 时，按其顺序和前两个记号之间的字符确定格式。 */
function tokenFormat(placeholder: string): DateFormat | null {
  const tokens = [...placeholder.matchAll(/yyyy|mm|dd/gi)];
  if (!tokens.some((t) => t[0].toLowerCase() === 'yyyy')) return null;
  const order = [...new Set(tokens.map((t) => t[0].charAt(0).toLowerCase() as DatePart))];
  const [first, second] = tokens;
  const between = first && second ? placeholder.slice(first.index + first[0].length, second.index).trim() : '';
  return { order, sep: SEPARATOR.test(between) ? between : '-', cjk: /年/.test(placeholder) };
}

/** 占位符是示例日期（如 "e.g. 2020-01"、"09/2020"）时，只认数字之间的分隔符。 */
function exampleFormat(placeholder: string): DateFormat | null {
  const yearFirst = /\d{4}([-/.])\d{1,2}/.exec(placeholder);
  if (yearFirst) return { order: ['y', 'm', 'd'], sep: yearFirst[1] ?? '-', cjk: false };
  const yearLast = /\d{1,2}([-/.])\d{4}/.exec(placeholder);
  if (yearLast) return { order: ['m', 'y'], sep: yearLast[1] ?? '-', cjk: false };
  return null;
}

function detectFormat(placeholder: string): DateFormat {
  const format = tokenFormat(placeholder);
  if (format) return format;
  if (/年/.test(placeholder)) return { ...ISO, cjk: true };
  return exampleFormat(placeholder) ?? ISO;
}

/** 只要求年份时只给年份；值里有"日"时保留，即便占位符只写到月。 */
function partsFor(format: DateFormat, hasDay: boolean): readonly DatePart[] {
  if (format.order.length === 1) return format.order;
  if (!hasDay) return format.order.filter((p) => p !== 'd');
  return format.order.includes('d') ? format.order : ISO.order;
}

function renderDate(value: string, placeholder: string): string {
  const [y = '', m = '', d = ''] = value.split('-');
  const format = detectFormat(placeholder);
  const pieces: Readonly<Record<DatePart, string>> = { y, m, d };
  const parts = partsFor(format, d !== '');
  if (format.cjk) return parts.map((p) => `${pieces[p]}${CJK_SUFFIX[p]}`).join('');
  return parts.map((p) => pieces[p]).join(format.sep);
}

/** 只认独立的格式记号（YYYY、MM 等）或「年」，避免 Summary 这类单词误判。 */
const DATE_TOKENS = /\b(?:yyyy|yy|mm|dd)\b|年/i;

export function formatDate(value: string, field: FieldDescriptor, english: boolean): string | null {
  if (!value) return null;
  if (field.kind === 'datepicker') {
    if (value === 'present') return null;
    return DATE_TOKENS.test(field.placeholder) ? renderDate(value, field.placeholder) : value;
  }
  if (value === 'present') return field.kind === 'month' || field.kind === 'date' ? null : english ? 'Present' : '至今';
  if (field.kind === 'month') return value.slice(0, 7);
  if (field.kind === 'date') return value.length === 7 ? `${value}-01` : value;
  return renderDate(value, field.placeholder);
}

const DISPLAY: Readonly<Record<string, readonly [string, string]>> = {
  male: ['男', 'Male'],
  female: ['女', 'Female'],
  highschool: ['高中', 'High School'],
  associate: ['大专', 'Associate'],
  bachelor: ['本科', 'Bachelor'],
  master: ['硕士', 'Master'],
  phd: ['博士', 'PhD'],
};

export function displayValue(path: FieldPath, raw: string, english: boolean): string {
  if (path !== 'basic.gender' && path !== 'education.degree') return raw;
  const pair = DISPLAY[raw];
  return pair ? pair[english ? 1 : 0] : raw;
}

export interface ResolveContext {
  index: number;
  english: boolean;
  field: FieldDescriptor;
}

const joinList = (items: readonly string[], english: boolean) => items.filter(Boolean).join(english ? ', ' : '、');
const nonEmpty = (value: string | undefined): string | null => (value?.trim() ? value : null);

function resolveBasic(key: string, profile: Profile, ctx: ResolveContext): string | null {
  const basic = profile.basic;
  if (key === 'name') return nonEmpty(ctx.english && basic.nameEn ? basic.nameEn : basic.name);
  if (key === 'nameFirst') return nonEmpty(splitName(basic, ctx.english).first);
  if (key === 'nameLast') return nonEmpty(splitName(basic, ctx.english).last);
  if (key === 'birthDate') return basic.birthDate ? formatDate(basic.birthDate, ctx.field, ctx.english) : null;
  return nonEmpty((basic as Record<string, string | undefined>)[key]);
}

function resolveEntry(group: string, key: string, profile: Profile, ctx: ResolveContext): string | null {
  const list = group === 'education' ? profile.education : group === 'experience' ? profile.experience : profile.projects;
  const entry = list[ctx.index] as Record<string, unknown> | undefined;
  if (!entry) return null;
  if (key === 'start' || key === 'end') return formatDate(String(entry[key] ?? ''), ctx.field, ctx.english);
  if (key === 'description') return nonEmpty((entry.bullets as string[] | undefined)?.join('\n'));
  const value = entry[key];
  return typeof value === 'string' ? nonEmpty(value) : null;
}

export function resolveValue(path: FieldPath, profile: Profile, ctx: ResolveContext): string | null {
  if (path.startsWith('custom:')) return nonEmpty(profile.custom[path.slice('custom:'.length)]);
  const [group = '', key = ''] = path.split('.');
  if (group === 'basic') return resolveBasic(key, profile, ctx);
  if (group === 'education' || group === 'experience' || group === 'projects') return resolveEntry(group, key, profile, ctx);
  if (path === 'preferences.expectedCities') return nonEmpty(joinList(profile.preferences.expectedCities, ctx.english));
  if (path === 'preferences.expectedSalary') return nonEmpty(profile.preferences.expectedSalary);
  if (path === 'preferences.availableFrom') {
    return profile.preferences.availableFrom ? formatDate(profile.preferences.availableFrom, ctx.field, ctx.english) : null;
  }
  if (path === 'skills.all') {
    const { languages, frameworks, tools } = profile.skills;
    return nonEmpty(joinList([...languages, ...frameworks, ...tools], ctx.english));
  }
  return null;
}
