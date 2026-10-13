import { MAX_LINE_CHARS, MAX_TEXT_CHARS } from '@/shared/constants';
import { emptyProfile } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { parseAwards } from './awards';
import { parseEducation } from './education';
import { type Entry, splitEntries } from './entries';
import { parseExperience } from './experience';
import { parseHeader } from './header';
import { normalizeText } from './normalize';
import { parseProjects } from './projects';
import { type SectionKey, splitSections } from './sections';
import { parseSkills } from './skills';
import type { ParseResult, ParseWarning } from './types';

type EntrySection = Extract<SectionKey, 'education' | 'experience' | 'projects'>;

function entriesOf(
  sections: Partial<Record<SectionKey, TextLine[]>>,
  key: EntrySection,
): { entries: Entry[]; warnings: ParseWarning[] } {
  const { entries, orphans } = splitEntries(sections[key] ?? []);
  const warnings = orphans.length > 0 ? [{ path: key, message: '部分内容未能归入条目，请对照原文检查' }] : [];
  return { entries, warnings };
}

/** 截断超长片段，累计字数超过上限后不再读取后续行；规范化在截断之后进行，保证正则只处理有界文本。 */
function prepareLines(rawLines: readonly TextLine[]): { lines: TextLine[]; truncated: boolean } {
  const lines: TextLine[] = [];
  let total = 0;
  for (const raw of rawLines) {
    const segments = raw.segments
      .map((s) => normalizeText(s.slice(0, MAX_LINE_CHARS)))
      .filter((s) => s.trim() !== '');
    if (segments.length === 0) continue;
    const length = segments.reduce((sum, s) => sum + s.length, 0);
    if (total + length > MAX_TEXT_CHARS) return { lines, truncated: true };
    total += length;
    lines.push({ ...raw, segments });
  }
  return { lines, truncated: false };
}

export function parseResume(rawLines: readonly TextLine[]): ParseResult {
  const { lines, truncated } = prepareLines(rawLines);
  const text = lines.map(lineText).join('\n');
  const { header, sections } = splitSections(lines);
  const basic = parseHeader(header, text);
  const edu = entriesOf(sections, 'education');
  const exp = entriesOf(sections, 'experience');
  const proj = entriesOf(sections, 'projects');
  const education = parseEducation(edu.entries);
  const experience = parseExperience(exp.entries);
  const projects = parseProjects(proj.entries);
  const skills = parseSkills(sections.skills ?? []);
  const awards = parseAwards(sections.awards ?? []);
  const globalWarnings: ParseWarning[] = [
    ...(Object.keys(sections).length === 0 ? [{ path: 'sections', message: '未识别到任何板块标题，解析结果可能不完整' }] : []),
    ...(truncated ? [{ path: 'sections', message: '简历内容过长，已截断' }] : []),
  ];
  return {
    profile: {
      ...emptyProfile(),
      basic: basic.value,
      education: education.value,
      experience: experience.value,
      projects: projects.value,
      skills: skills.value,
      awards: awards.value,
    },
    warnings: [
      ...globalWarnings, ...basic.warnings,
      ...edu.warnings, ...education.warnings,
      ...exp.warnings, ...experience.warnings,
      ...proj.warnings, ...projects.warnings,
      ...skills.warnings, ...awards.warnings,
    ],
    text,
  };
}
