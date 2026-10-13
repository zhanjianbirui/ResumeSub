import type { Education } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { detectDegree, stripDegree } from './degree';
import { type Entry, entryTitle } from './entries';
import { splitLocation, splitTrailing } from './text';
import { type Parsed, warnings } from './types';

const SCHOOL_EN = /^(.+?)\s*[（(]\s*([A-Za-z][^）)]*?)\s*[）)]\s*$/;
const COURSES = /^(?:核心课程|主修课程|主要课程|相关课程|courses?|relevant coursework|core modules|modules)\s*[:：]\s*(.+)$/i;
const GPA = /\bGPA\s*[:：]?\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/i;
const RANK = /(?:专业排名|排名|rank(?:ing)?)\s*[:：]?\s*(前?\s*\d+(?:\.\d+)?\s*%|\d+\s*\/\s*\d+)/i;

function splitSchool(text: string): { school: string; schoolEn?: string } {
  const match = SCHOOL_EN.exec(text);
  return match ? { school: (match[1] ?? '').trim(), schoolEn: (match[2] ?? '').trim() } : { school: text };
}

function parseEntry(entry: Entry, index: number): Parsed<Education> {
  const title = entryTitle(entry);
  const [left, right] = entry.subs[0] ? splitTrailing(entry.subs[0]) : ['', undefined];
  const all = [lineText(entry.head), ...entry.subs.map(lineText), ...entry.bullets].join(' ');
  const value: Education = {
    ...splitSchool(title),
    degree: detectDegree(`${left} ${title}`),
    major: stripDegree(left),
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    gpa: GPA.exec(all)?.[1]?.replace(/\s+/g, ''),
    rank: RANK.exec(all)?.[1]?.replace(/\s+/g, ''),
    courses: entry.bullets.map((b) => COURSES.exec(b)?.[1]).find(Boolean),
    ...(right ? splitLocation(right) : {}),
  };
  const base = `education.${index}`;
  return {
    value,
    warnings: warnings([
      [!value.school, `${base}.school`, '未识别到学校名称'],
      [!value.degree, `${base}.degree`, '未识别到学历，请手动选择'],
      [Boolean(value.degree) && !value.major, `${base}.major`, '未识别到专业'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseEducation(entries: readonly Entry[]): Parsed<Education[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
