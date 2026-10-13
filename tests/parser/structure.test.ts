import { describe, expect, it } from 'vitest';
import { entryTitle, isBullet, joinWrapped, mergeBullets, splitEntries, stripBullet } from '@/parser/entries';
import { headingKey, splitSections } from '@/parser/sections';
import { lineText } from '@/shared/text-line';
import { EN_RESUME, line, lines, ZH_RESUME } from '../helpers/lines';

describe('headingKey', () => {
  it.each([
    ['教育背景', 'education'],
    ['EDUCATION', 'education'],
    ['实习经验', 'experience'],
    ['Work Experience', 'experience'],
    ['项目经验', 'projects'],
    ['技能特长', 'skills'],
    ['Honors and Awards', 'awards'],
    ['自我评价', 'other'],
  ])('%s → %s', (text, key) => {
    expect(headingKey(line(text))).toBe(key);
  });

  it.each([
    ['【教育背景】', 'education'],
    ['[Projects]', 'projects'],
    ['（技能特长）', 'skills'],
    ['01 教育背景', 'education'],
    ['1. 实习经历', 'experience'],
    ['一、项目经历', 'projects'],
    ['—— 荣誉奖项 ——', 'awards'],
    ['教育背景 / EDUCATION', 'education'],
    ['项目经验 | Projects', 'projects'],
    ['Education Background', 'education'],
  ])('decorated or bilingual %s → %s', (text, key) => {
    expect(headingKey(line(text))).toBe(key);
  });

  it('rejects bilingual lines whose parts disagree', () => {
    expect(headingKey(line('教育背景 / Projects'))).toBeNull();
  });

  it('ignores long lines and normal content', () => {
    expect(headingKey(line('教育背景以及其他很多很多很多很多很多很多很多很多的文字'))).toBeNull();
    expect(headingKey(line('参与项目开发'))).toBeNull();
  });
});

describe('splitSections', () => {
  it('splits the Chinese fixture into header and five sections', () => {
    const { header, sections } = splitSections(ZH_RESUME);
    expect(header.map(lineText)).toEqual(['李明', '13800138000 | liming@example.com']);
    expect(Object.keys(sections).sort()).toEqual(['awards', 'education', 'experience', 'projects', 'skills']);
    expect(sections.skills).toHaveLength(4);
  });

  it('appends repeated headings to the same section', () => {
    const { sections } = splitSections(lines('项目经验', 'A', '项目经历', 'B'));
    expect(sections.projects?.map(lineText)).toEqual(['A', 'B']);
  });
});

describe('bullets', () => {
  it('detects and strips bullet markers', () => {
    expect(isBullet('• 做了 A')).toBe(true);
    expect(isBullet('- Built X')).toBe(true);
    expect(isBullet('1. First')).toBe(true);
    expect(isBullet('3.8/4.0 GPA')).toBe(false);
    expect(isBullet('PyTorch · CNN')).toBe(false);
    expect(stripBullet('•  做了 A')).toBe('做了 A');
  });

  it('joins wrapped lines with a space only between latin words', () => {
    expect(joinWrapped('提升约', '8%')).toBe('提升约8%');
    expect(joinWrapped('Built REST', 'APIs')).toBe('Built REST APIs');
  });

  it('mergeBullets folds continuation lines into the previous item', () => {
    expect(mergeBullets(lines('• 第一条很长', '的续行', '• 第二条'))).toEqual(['第一条很长的续行', '第二条']);
  });
});

describe('splitEntries', () => {
  it('groups head, sub lines and wrapped bullets', () => {
    const { sections } = splitSections(ZH_RESUME);
    const { entries, orphans } = splitEntries(sections.projects ?? []);
    expect(orphans).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entryTitle(entries[0]!)).toBe('图像分类系统（导师：Prof. Alex Smith）');
    expect(entries[0]!.range).toMatchObject({ start: '2025-10', end: 'present' });
    expect(entries[0]!.subs.map(lineText)).toEqual(['PyTorch · CNN · 图像分析 团队项目']);
    expect(entries[0]!.bullets).toEqual([
      '基于 PyTorch 构建 CNN 进行多类别分类，设计数据增强策略缓解样本不足问题，验证集准确率提升约 8%',
    ]);
  });

  it('reports lines before the first entry as orphans', () => {
    const { entries, orphans } = splitEntries(lines('孤立的一行', ['Acme', '2020.01 - 2020.02']));
    expect(entries).toHaveLength(1);
    expect(orphans.map(lineText)).toEqual(['孤立的一行']);
  });

  it('keeps wrapped bullet continuations with numbers or year ranges inside the bullet', () => {
    const { entries } = splitEntries(lines(
      ['示例公司 – 后端实习生', '2023.07 - 2023.09'],
      '• 优化接口性能，平均',
      '耗时从 2000-2500ms 降到 300ms',
      '• 维护 2019 - 2020 年的',
      '历史数据 2019 - 2020 版本迁移',
    ));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.bullets).toEqual(['优化接口性能，平均耗时从 2000-2500ms 降到 300ms', '维护 2019 - 2020 年的历史数据 2019 - 2020 版本迁移']);
  });

  it('starts entries at numbered heads with a date range, but not at symbol bullets', () => {
    const { entries, orphans } = splitEntries(lines(
      '1. 智能客服系统 2023.03 - 2023.06',
      '• 搭建意图识别模块 2023.04 - 2023.05',
      '2. 推荐系统 2023.07 - 2023.09',
    ));
    expect(orphans).toEqual([]);
    expect(entries.map(entryTitle)).toEqual(['智能客服系统', '推荐系统']);
    expect(entries[0]!.range).toMatchObject({ start: '2023-03', end: '2023-06' });
    expect(entries[0]!.bullets).toEqual(['搭建意图识别模块 2023.04 - 2023.05']);
  });

  it('still starts a new entry after bullets for a right-aligned year-only range', () => {
    const { entries } = splitEntries(lines(['Chess Engine', '2022 – 2023'], '- Alpha-beta', ['Go Bot', '2020 – 2021'], '- MCTS'));
    expect(entries.map(entryTitle)).toEqual(['Chess Engine', 'Go Bot']);
  });

  it('handles the English fixture', () => {
    const { sections } = splitSections(EN_RESUME);
    const { entries } = splitEntries(sections.experience ?? []);
    expect(entries[0]!.bullets).toEqual(['Built REST APIs in Go']);
  });
});
