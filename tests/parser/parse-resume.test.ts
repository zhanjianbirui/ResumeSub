import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { mergeParsed } from '@/parser/merge';
import { parseResume } from '@/parser/parse-resume';
import { emptyEducation, emptyProfile, ProfileSchema } from '@/shared/schema/profile';
import { EN_RESUME, lines, ZH_RESUME } from '../helpers/lines';

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
