import type { Project } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { type Entry, entryTitle } from './entries';
import { splitTrailing } from './text';
import { type Parsed, warnings } from './types';

const TECH_SEPARATOR = /\s*[·•|｜、/]\s*/;
const MAX_BARE_TECH_LENGTH = 30;
const ROLE_HINT = /负责人|成员|组长|队长|个人项目|团队项目|\blead\b|\bmember\b|\bowner\b|\bindividual\b|\bteam\b/i;

/** 副行如果是用分隔符列出的短语，或者是很短的一段文字，就当作技术栈；否则当作描述。 */
function isTechLine(text: string): boolean {
  return TECH_SEPARATOR.test(text) || text.length <= MAX_BARE_TECH_LENGTH;
}

function parseEntry(entry: Entry, index: number): Parsed<Project> {
  const [left, right] = entry.subs[0] ? splitTrailing(entry.subs[0]) : ['', undefined];
  const techLine = left !== '' && isTechLine(left);
  const value: Project = {
    name: entryTitle(entry),
    role: right && ROLE_HINT.test(right) ? right : undefined,
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    tech: techLine ? left.split(TECH_SEPARATOR).map((s) => s.trim()).filter(Boolean) : [],
    bullets: [...entry.subs.slice(techLine ? 1 : 0).map(lineText), ...entry.bullets],
  };
  const base = `projects.${index}`;
  return {
    value,
    warnings: warnings([
      [!value.name, `${base}.name`, '未识别到项目名称'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseProjects(entries: readonly Entry[]): Parsed<Project[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
