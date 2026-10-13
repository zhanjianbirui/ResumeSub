import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { mergeParsed } from '@/parser/merge';
import { parseResume } from '@/parser/parse-resume';
import { emptyEducation, emptyProfile, ProfileSchema } from '@/shared/schema/profile';
import { MAX_LINE_CHARS, MAX_TEXT_CHARS } from '@/shared/constants';
import { EN_RESUME, line, lines, ZH_RESUME } from '../helpers/lines';

describe('parseResume', () => {
  it('produces a schema-valid profile from the Chinese fixture', () => {
    const result = parseResume(ZH_RESUME);
    expect(v.safeParse(ProfileSchema, result.profile).success).toBe(true);
    expect(result.profile.basic.name).toBe('李明');
    expect(result.profile.education).toHaveLength(2);
    expect(result.profile.experience).toHaveLength(2);
    expect(result.profile.projects).toHaveLength(1);
    expect(result.profile.awards).toHaveLength(3);
    expect(result.warnings).toEqual([]);
    expect(result.text.split('\n')[0]).toBe('李明');
  });

  it('produces a schema-valid profile from the English fixture', () => {
    const result = parseResume(EN_RESUME);
    expect(v.safeParse(ProfileSchema, result.profile).success).toBe(true);
    expect(result.profile.skills.languages).toEqual(['Python', 'Rust', 'Go']);
  });

  it('warns when no section headings are found and about orphan lines', () => {
    const none = parseResume(lines('张三', '一些无法识别的内容'));
    expect(none.warnings.map((w) => w.path)).toContain('sections');
    const orphan = parseResume(lines('张三', '教育背景', '孤立行', ['某大学', '2020.09 - 2024.06'], '物理学 本科'));
    expect(orphan.warnings.map((w) => w.path)).toContain('education');
  });
});

describe('parseResume input bounds', () => {
  it('parses a pathological 200k-char line quickly and still yields a valid profile', () => {
    const huge = line('a'.repeat(100_000) + ' '.repeat(100_000));
    const startedAt = performance.now();
    const result = parseResume([huge, ...ZH_RESUME]);
    expect(performance.now() - startedAt).toBeLessThan(1000);
    expect(v.safeParse(ProfileSchema, result.profile).success).toBe(true);
    expect(result.profile.education).toHaveLength(2);
  });

  it('truncates long segments', () => {
    const result = parseResume(lines('李明', 'x'.repeat(MAX_LINE_CHARS + 50)));
    expect(result.text.split('\n')[1]).toHaveLength(MAX_LINE_CHARS);
  });

  it('stops reading and warns once the total text exceeds the limit', () => {
    const filler = Array.from({ length: Math.ceil(MAX_TEXT_CHARS / MAX_LINE_CHARS) + 5 }, () => 'y'.repeat(MAX_LINE_CHARS));
    const result = parseResume(lines('李明', ...filler));
    expect(result.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + filler.length);
    expect(result.warnings).toContainEqual({ path: 'sections', message: '简历内容过长，已截断' });
    expect(parseResume(ZH_RESUME).warnings).toEqual([]);
  });
});

describe('mergeParsed', () => {
  it('overrides non-empty basic fields and replaces non-empty lists only', () => {
    const base = emptyProfile();
    const current = {
      ...base,
      basic: { ...base.basic, name: '旧名', phone: '13000000000', idNumber: 'X1' },
      education: [{ ...emptyEducation(), school: '旧学校' }],
      skills: { ...base.skills, tools: ['Vim'] },
      preferences: { ...base.preferences, expectedCities: ['上海'] },
      custom: { 是否接受调剂: '是' },
    };
    const parsed = {
      ...base,
      basic: { ...base.basic, name: '新名', phone: '', email: 'new@example.com' },
      skills: { ...base.skills, languages: ['Go'] },
    };
    const merged = mergeParsed(current, parsed);
    expect(merged.basic).toMatchObject({ name: '新名', phone: '13000000000', email: 'new@example.com', idNumber: 'X1' });
    expect(merged.education).toEqual(current.education);
    expect(merged.skills).toEqual({ ...base.skills, languages: ['Go'], tools: ['Vim'] });
    expect(merged.preferences).toEqual(current.preferences);
    expect(merged.custom).toEqual(current.custom);
    expect(current.basic.name).toBe('旧名');
  });
});
