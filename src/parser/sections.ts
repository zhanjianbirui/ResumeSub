import { lineText, type TextLine } from '@/shared/text-line';

export type SectionKey = 'education' | 'experience' | 'projects' | 'skills' | 'awards' | 'other';

const HEADINGS: Readonly<Record<SectionKey, readonly string[]>> = {
  education: ['教育背景', '教育经历', '教育', '学历', 'Education', 'Education Background', 'Academic Background'],
  experience: [
    '实习经验', '实习经历', '工作经验', '工作经历', '实践经历', '职业经历',
    'Experience', 'Work Experience', 'Professional Experience', 'Internships', 'Internship Experience', 'Employment',
  ],
  projects: ['项目经验', '项目经历', '科研经历', '科研项目', '项目', 'Projects', 'Project Experience', 'Research', 'Research Experience'],
  skills: ['技能特长', '专业技能', '技能', '技能证书', 'Skills', 'Technical Skills', 'Skills and Interests'],
  awards: ['荣誉奖项', '获奖情况', '获奖经历', '荣誉', '奖项', 'Awards', 'Honors', 'Honors and Awards', 'Awards and Honors', 'Achievements'],
  other: ['自我评价', '个人总结', '个人简介', '校园经历', '社会实践', '兴趣爱好', '论文', 'Summary', 'Profile', 'Interests', 'Publications'],
};

const MAX_HEADING_LENGTH = 24;

const normalize = (text: string) => text.toLowerCase().replace(/\band\b/g, '').replace(/[\s:：&＆、/|·•\-–—]/g, '');

const LOOKUP: ReadonlyMap<string, SectionKey> = new Map(
  (Object.entries(HEADINGS) as [SectionKey, readonly string[]][]).flatMap(([key, names]) =>
    names.map((name) => [normalize(name), key] as const),
  ),
);

export function headingKey(line: TextLine): SectionKey | null {
  const text = lineText(line).trim();
  if (text.length === 0 || text.length > MAX_HEADING_LENGTH) return null;
  return LOOKUP.get(normalize(text)) ?? null;
}

export function splitSections(lines: readonly TextLine[]): {
  header: TextLine[];
  sections: Partial<Record<SectionKey, TextLine[]>>;
} {
  const header: TextLine[] = [];
  const sections: Partial<Record<SectionKey, TextLine[]>> = {};
  let current: SectionKey | null = null;
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      current = key;
      sections[key] = sections[key] ?? [];
    } else if (current) {
      sections[current]?.push(line);
    } else {
      header.push(line);
    }
  }
  return { header, sections };
}
