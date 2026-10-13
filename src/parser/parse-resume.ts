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

export function parseResume(rawLines: readonly TextLine[]): ParseResult {
  const lines = rawLines
    .map((l) => ({ ...l, segments: l.segments.map(normalizeText).filter((s) => s.trim() !== '') }))
    .filter((l) => l.segments.length > 0);
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
  const noSections: ParseWarning[] = Object.keys(sections).length === 0
    ? [{ path: 'sections', message: '未识别到任何板块标题，解析结果可能不完整' }]
    : [];
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
      ...noSections, ...basic.warnings,
      ...edu.warnings, ...education.warnings,
      ...exp.warnings, ...experience.warnings,
      ...proj.warnings, ...projects.warnings,
      ...skills.warnings, ...awards.warnings,
    ],
    text,
  };
}
