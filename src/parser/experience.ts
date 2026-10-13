import type { Experience } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { type Entry, entryTitle } from './entries';
import { splitOnce, splitTrailing } from './text';
import { type Parsed, warnings } from './types';

const TITLE_SEPARATOR = /\s+[–—-]\s+|\s*[|｜]\s*/;
const INTERN = /实习|\bintern(?:ship)?s?\b/i;

/** 头行没有分隔符时，职位在第一行副行；副行右侧片段通常是地点。 */
function subTitle(entry: Entry): [string, string | undefined] {
  return entry.subs[0] ? splitTrailing(entry.subs[0]) : ['', undefined];
}

function parseEntry(entry: Entry, index: number): Parsed<Experience> {
  const title = entryTitle(entry);
  const split = splitOnce(title, TITLE_SEPARATOR);
  const [role, location] = split ? [split[1], undefined] : subTitle(entry);
  const company = split ? split[0] : title;
  const extraSubs = split ? entry.subs : entry.subs.slice(1);
  const value: Experience = {
    company,
    title: role,
    ...(location ? { location } : {}),
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    type: INTERN.test(`${company} ${role}`) ? 'intern' : 'fulltime',
    bullets: [...extraSubs.map(lineText), ...entry.bullets],
  };
  const base = `experience.${index}`;
  return {
    value,
    warnings: warnings([
      [!company, `${base}.company`, '未识别到公司名称'],
      [!role, `${base}.title`, '未识别到职位'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseExperience(entries: readonly Entry[]): Parsed<Experience[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
