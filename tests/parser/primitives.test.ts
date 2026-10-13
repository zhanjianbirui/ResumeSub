import { describe, expect, it } from 'vitest';
import { extractContacts } from '@/parser/contacts';
import { findDateRange, findMonth, removeRange } from '@/parser/dates';
import { detectDegree, stripDegree } from '@/parser/degree';
import { splitList, splitLocation, splitOnce, splitTrailing } from '@/parser/text';
import { warnings } from '@/parser/types';

describe('findDateRange', () => {
  it.each([
    ['2025.09 – 2026.09', '2025-09', '2026-09'],
    ['2023/7 - 2023/9', '2023-07', '2023-09'],
    ['2021年9月至2025年6月', '2021-09', '2025-06'],
    ['2025.10 – 至今', '2025-10', 'present'],
    ['Sep 2023 – Present', '2023-09', 'present'],
    ['June 2022 to Aug. 2022', '2022-06', '2022-08'],
    ['2024-01 ~ 2024-03', '2024-01', '2024-03'],
  ])('parses %s', (text, start, end) => {
    expect(findDateRange(text)).toMatchObject({ start, end, approximate: false });
  });

  it('marks year-only ranges as approximate', () => {
    expect(findDateRange('2021 - 2025')).toMatchObject({ start: '2021-01', end: '2025-12', approximate: true });
  });

  it('ignores lone dates, invalid months and words like Summary/presentation', () => {
    expect(findDateRange('2025.09')).toBeNull();
    expect(findDateRange('Summary 2020')).toBeNull();
    expect(findDateRange('presentation 2020 slides')).toBeNull();
    expect(findDateRange('2021.13 - 2022.01')).toBeNull();
  });

  it('removeRange strips the range from the line', () => {
    const text = '示例大学 2021.09 – 2025.06';
    expect(removeRange(text, findDateRange(text)!)).toBe('示例大学');
  });

  it('findMonth returns the first month token', () => {
    expect(findMonth('获奖 2023.05')).toBe('2023-05');
    expect(findMonth('2022–2024')).toBeUndefined();
  });
});

describe('extractContacts', () => {
  it('extracts Chinese mobile and email without matching digits inside the email', () => {
    expect(extractContacts('13800138000 | a13800138000@example.com')).toEqual({
      phone: '13800138000', email: 'a13800138000@example.com',
    });
  });

  it('extracts international phone and profile links', () => {
    const text = 'alex@example.com | +44 7700 900123 | linkedin.com/in/alex | github.com/alex | https://alex.dev';
    expect(extractContacts(text)).toEqual({
      email: 'alex@example.com',
      phone: '+447700900123',
      linkedin: 'linkedin.com/in/alex',
      github: 'github.com/alex',
      website: 'https://alex.dev',
    });
  });

  it('returns an empty object when nothing matches', () => {
    expect(extractContacts('无联系方式')).toEqual({});
  });
});

describe('degree', () => {
  it.each([
    ['人工智能 – 理学硕士（在读）', 'master'],
    ['计算机科学与技术 – 本科', 'bachelor'],
    ['MSc Artificial Intelligence', 'master'],
    ['Bachelor of Engineering in Software', 'bachelor'],
    ['PhD in Physics', 'phd'],
    ['大专', 'associate'],
    ['人工智能', ''],
  ])('detectDegree(%s) = %s', (text, code) => {
    expect(detectDegree(text)).toBe(code);
  });

  it.each([
    ['人工智能 – 理学硕士（在读）', '人工智能'],
    ['计算机科学与技术 – 本科', '计算机科学与技术'],
    ['MSc Artificial Intelligence', 'Artificial Intelligence'],
    ['Bachelor of Engineering in Software Engineering', 'Software Engineering'],
  ])('stripDegree(%s) = %s', (text, major) => {
    expect(stripDegree(text)).toBe(major);
  });
});

describe('text helpers', () => {
  it('splitList respects parentheses', () => {
    expect(splitList('中文（母语）、英语（雅思 7，CET-6）, Go')).toEqual(['中文（母语）', '英语（雅思 7，CET-6）', 'Go']);
  });

  it('splitOnce splits at the first match only', () => {
    expect(splitOnce('A – B – C', /\s+[–-]\s+/)).toEqual(['A', 'B – C']);
    expect(splitOnce('ABC', /\|/)).toBeNull();
  });

  it('splitTrailing separates the last segment', () => {
    expect(splitTrailing({ page: 1, y: 0, size: 10, segments: ['a', 'b', 'c'] })).toEqual(['a b', 'c']);
    expect(splitTrailing({ page: 1, y: 0, size: 10, segments: ['only'] })).toEqual(['only', undefined]);
  });

  it('splitLocation splits city and country', () => {
    expect(splitLocation('Manchester, UK')).toEqual({ city: 'Manchester', country: 'UK' });
    expect(splitLocation('福州，中国')).toEqual({ city: '福州', country: '中国' });
    expect(splitLocation('London')).toEqual({ city: 'London', country: undefined });
  });

  it('warnings keeps only true checks', () => {
    expect(warnings([[true, 'a', 'x'], [false, 'b', 'y']])).toEqual([{ path: 'a', message: 'x' }]);
  });
});
