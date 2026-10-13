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

function dateStyle(placeholder: string): (y: string, m: string) => string {
  if (/年/.test(placeholder)) return (y, m) => `${y}年${m}月`;
  if (/\//.test(placeholder)) return (y, m) => `${y}/${m}`;
  if (/\d\.\d|\.mm|\./i.test(placeholder)) return (y, m) => `${y}.${m}`;
  return (y, m) => `${y}-${m}`;
}

export function formatDate(value: string, field: FieldDescriptor, english: boolean): string | null {
  if (!value) return null;
  if (value === 'present') return field.kind === 'month' || field.kind === 'date' ? null : english ? 'Present' : '至今';
  if (field.kind === 'month') return value.slice(0, 7);
  if (field.kind === 'date') return value.length === 7 ? `${value}-01` : value;
  const [y = '', m = ''] = value.split('-');
  return dateStyle(field.placeholder)(y, m);
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
