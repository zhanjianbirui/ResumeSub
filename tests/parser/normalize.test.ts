import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/parser/normalize';
import { parseResume } from '@/parser/parse-resume';
import { lines } from '../helpers/lines';

describe('normalizeText', () => {
  it('maps Kangxi radicals to unified ideographs', () => {
    expect(normalizeText('⼤学')).toBe('大学');
    expect(normalizeText('硕⼠')).toBe('硕士');
    expect(normalizeText('项⽬经历')).toBe('项目经历');
  });

  it('maps CJK radicals supplement and joins split glyphs', () => {
    expect(normalizeText('美⻝')).toBe('美食');
    expect(normalizeText('⻩ 栩')).toBe('黄栩');
  });

  it('keeps full-width punctuation and latin spacing', () => {
    expect(normalizeText('中文（母语）, Spring Boot')).toBe('中文（母语）, Spring Boot');
  });

  it('does not join CJK across a dash', () => {
    expect(normalizeText('人工智能 – 理学硕士')).toBe('人工智能 – 理学硕士');
  });
});

describe('parseResume with compatibility glyphs', () => {
  it('recognises headings and names after normalisation', () => {
    const result = parseResume(lines('⻩ 栩', '项⽬经历', ['系统', '2024.01 - 2024.02']));
    expect(result.profile.basic.name).toBe('黄栩');
    expect(result.profile.projects).toHaveLength(1);
  });
});
