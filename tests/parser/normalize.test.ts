import { describe, expect, it } from 'vitest';
import { normalizeText } from '@/parser/normalize';
import { parseResume } from '@/parser/parse-resume';
import { line, lines } from '../helpers/lines';

describe('normalizeText', () => {
  it('maps Kangxi radicals to unified ideographs', () => {
    expect(normalizeText('⼤学')).toBe('大学');
    expect(normalizeText('硕⼠')).toBe('硕士');
    expect(normalizeText('项⽬经历')).toBe('项目经历');
  });

  it('maps CJK radicals supplement and joins split glyphs', () => {
    expect(normalizeText('美⻝')).toBe('美食');
    expect(normalizeText('⻩ 梅')).toBe('黄梅');
  });

  it('joins only runs of single split glyphs, not spaced words', () => {
    expect(normalizeText('李 明 同学')).toBe('李明 同学');
    expect(normalizeText('清华大学 计算机 本科')).toBe('清华大学 计算机 本科');
    expect(normalizeText('北京 上海')).toBe('北京 上海');
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
    const result = parseResume(lines('⻩ 梅', '项⽬经历', ['系统', '2024.01 - 2024.02']));
    expect(result.profile.basic.name).toBe('黄梅');
    expect(result.profile.projects).toHaveLength(1);
  });

  it('drops lines left without segments after normalisation', () => {
    const result = parseResume([line(['']), ...lines('李明', '13800138000')]);
    expect(result.profile.basic.name).toBe('李明');
    expect(result.text.split('\n')[0]).toBe('李明');
  });
});
