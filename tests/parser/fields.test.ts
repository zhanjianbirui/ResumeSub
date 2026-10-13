import { describe, expect, it } from 'vitest';
import { parseAwards } from '@/parser/awards';
import { parseEducation } from '@/parser/education';
import { splitEntries } from '@/parser/entries';
import { parseExperience } from '@/parser/experience';
import { parseHeader } from '@/parser/header';
import { parseProjects } from '@/parser/projects';
import { splitSections } from '@/parser/sections';
import { parseSkills } from '@/parser/skills';
import { lineText } from '@/shared/text-line';
import { EN_RESUME, lines, ZH_RESUME } from '../helpers/lines';

const zh = splitSections(ZH_RESUME);
const en = splitSections(EN_RESUME);
const entriesOf = (section: keyof typeof zh.sections, source = zh) => splitEntries(source.sections[section] ?? []).entries;
const fullText = (src: typeof ZH_RESUME) => src.map(lineText).join('\n');

describe('parseHeader', () => {
  it('reads name, phone and email', () => {
    const { value, warnings } = parseHeader(zh.header, fullText(ZH_RESUME));
    expect(value).toMatchObject({ name: '李明', phone: '13800138000', email: 'liming@example.com' });
    expect(warnings).toEqual([]);
  });

  it('reads English contacts and links', () => {
    const { value } = parseHeader(en.header, fullText(EN_RESUME));
    expect(value).toMatchObject({
      name: 'Alex Chen', phone: '+447700900123', email: 'alex.chen@example.com',
      linkedin: 'linkedin.com/in/alexchen', github: 'github.com/alexchen',
    });
  });

  it('falls back to the full text for contacts and warns on a missing name', () => {
    const { value, warnings } = parseHeader(lines('13900000000'), 'x 13900000000 y@example.com');
    expect(value).toMatchObject({ name: '', phone: '13900000000', email: 'y@example.com' });
    expect(warnings.map((w) => w.path)).toEqual(['basic.name']);
  });
});

describe('parseEducation', () => {
  it('parses Chinese education entries', () => {
    const { value } = parseEducation(entriesOf('education'));
    expect(value).toEqual([
      expect.objectContaining({
        school: '伦敦示例大学', schoolEn: 'Example University London', degree: 'master', major: '数据科学',
        start: '2025-09', end: '2026-09', courses: '机器学习、统计推断', city: 'London', country: 'UK',
      }),
      expect.objectContaining({
        school: '示例师范大学', degree: 'bachelor', major: '软件工程', start: '2021-09', end: '2025-06',
        gpa: '3.7/4.0', rank: '前10%', city: '杭州', country: '中国',
      }),
    ]);
  });

  it('parses English education and warns on unknown degree', () => {
    expect(parseEducation(entriesOf('education', en)).value[0]).toMatchObject({
      school: 'Example University', degree: 'master', major: 'Artificial Intelligence',
      start: '2024-09', end: '2025-06', city: 'Manchester', country: 'UK',
    });
    const { warnings } = parseEducation(splitEntries(lines(['某大学', '2020.09 - 2024.06'], '物理学')).entries);
    expect(warnings.map((w) => w.path)).toEqual(['education.0.degree']);
  });
});

describe('parseExperience', () => {
  it('splits company and title and detects internships', () => {
    const { value } = parseExperience(entriesOf('experience'));
    expect(value).toEqual([
      { company: '示例计算中心', title: 'AI 实习生（线上）', start: '2026-04', end: 'present', type: 'intern', bullets: ['参与图像识别算法研发'] },
      { company: '示例科技有限公司', title: 'Java 后端开发实习生', start: '2023-07', end: '2023-09', type: 'intern', bullets: ['基于 Spring Boot 设计 RESTful API'] },
    ]);
  });

  it('uses the first sub line as title when the head has no separator', () => {
    const { value } = parseExperience(splitEntries(lines(['Globex', '2020.01 - 2021.01'], 'Backend Engineer', '- Shipped X')).entries);
    expect(value[0]).toMatchObject({ company: 'Globex', title: 'Backend Engineer', type: 'fulltime', bullets: ['Shipped X'] });
  });

  it('parses English experience', () => {
    expect(parseExperience(entriesOf('experience', en)).value[0]).toMatchObject({
      company: 'Acme Corp', title: 'Software Engineer Intern', type: 'intern', start: '2023-06', end: '2023-08',
    });
  });
});

describe('parseProjects', () => {
  it('parses name, tech list, role and bullets', () => {
    const { value } = parseProjects(entriesOf('projects'));
    expect(value[0]).toMatchObject({
      name: '图像分类系统（导师：Prof. Alex Smith）', role: '团队项目',
      tech: ['PyTorch', 'CNN', '图像分析'], start: '2025-10', end: 'present',
    });
  });

  it('warns about approximate dates and treats long prose sub lines as bullets', () => {
    const { value, warnings } = parseProjects(entriesOf('projects', en));
    expect(value[0]).toMatchObject({ name: 'Chess Engine', tech: ['Rust', 'WebAssembly'], role: 'Individual' });
    expect(warnings.map((w) => w.path)).toEqual(['projects.0.start']);
    const prose = parseProjects(splitEntries(lines(['X', '2020.01 - 2020.02'], '这是一段很长的项目描述，没有任何技术栈分隔符，用来说明项目背景')).entries);
    expect(prose.value[0]).toMatchObject({ tech: [], bullets: ['这是一段很长的项目描述，没有任何技术栈分隔符，用来说明项目背景'] });
  });
});

describe('parseSkills', () => {
  it('classifies labelled skill lines', () => {
    expect(parseSkills(zh.sections.skills ?? []).value).toEqual({
      languages: ['Python', 'Java', 'SQL'],
      frameworks: ['PyTorch', 'scikit-learn'],
      tools: ['Git', 'Linux', 'MySQL'],
      langCerts: ['中文（母语）', '英语（雅思 7，CET-6）'],
    });
  });

  it('treats an English "Languages" line with programming languages as languages', () => {
    expect(parseSkills(en.sections.skills ?? []).value).toMatchObject({
      languages: ['Python', 'Rust', 'Go'], tools: ['Docker', 'Git'],
    });
  });

  it('puts unknown labels into tools with a warning', () => {
    const { value, warnings } = parseSkills(lines('爱好：篮球'));
    expect(value.tools).toEqual(['篮球']);
    expect(warnings).toHaveLength(1);
  });
});

describe('parseAwards', () => {
  it('splits award items and detects level', () => {
    expect(parseAwards(zh.sections.awards ?? []).value).toEqual([
      { name: '国家级创新项目负责人（2022–2024）', date: undefined, level: '国家级' },
      { name: '省级程序设计竞赛三等奖', date: undefined, level: '省级' },
      { name: '校一等奖学金', date: undefined, level: undefined },
    ]);
  });

  it('records a month when present', () => {
    expect(parseAwards(lines('• 优秀毕业生 2025.06')).value[0]!.date).toBe('2025-06');
  });
});
