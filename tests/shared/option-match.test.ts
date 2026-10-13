import { describe, expect, it } from 'vitest';
import { synonymsFor } from '@/background/autofill/options';
import { chooseOption } from '@/shared/option-match';

describe('chooseOption (moved to shared)', () => {
  it('chooseOption matches exact, then loose, ignoring placeholders', () => {
    const options = [{ value: '', label: '请选择' }, { value: '1', label: '本科' }, { value: '2', label: '硕士研究生' }];
    expect(chooseOption(options, ['本科', '学士'])).toBe('1');
    expect(chooseOption(options, ['硕士', 'master'])).toBe('2');
    expect(chooseOption(options, ['博士'])).toBeNull();
    expect(chooseOption([{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }], ['男', 'male', 'm'])).toBe('M');
  });

  it('chooseOption does not loosely map 博士后 or 研究生及以上 (R5)', () => {
    const phd = synonymsFor('education.degree', 'phd');
    const master = synonymsFor('education.degree', 'master');
    expect(chooseOption([{ value: 'pd', label: '博士后' }], phd)).toBeNull();
    expect(chooseOption([{ value: 'pd', label: '博士后' }, { value: 'd', label: '博士研究生' }], phd)).toBe('d');
    expect(chooseOption([{ value: 'up', label: '研究生及以上' }], master)).toBeNull();
    expect(chooseOption([{ value: 'up', label: '硕士以上' }], master)).toBeNull();
    expect(chooseOption([{ value: 'm', label: '硕士研究生' }], master)).toBe('m');
  });
});

describe('chooseOption (A4)', () => {
  const male = ['男', 'male', 'man', '先生', 'm', '男性'];
  it('requires exact matches for Latin labels', () => {
    expect(chooseOption([{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }], male)).toBe('M');
    expect(chooseOption([{ value: '1', label: 'Mastercard' }], ['master'])).toBeNull();
    expect(chooseOption([{ value: '1', label: 'Bachelor of Science' }], ['bachelor'])).toBe('1');
  });

  it('never picks Female (女) for male', () => {
    const options = [{ value: '1', label: 'Female (女)' }, { value: '2', label: 'Male (男)' }];
    expect(chooseOption(options, male)).toBe('2');
    expect(chooseOption(options, ['女', 'female', 'woman', '女士', 'f', '女性'])).toBe('1');
  });

  it('maps 男性/女性 options through gender synonyms', () => {
    const options = [{ value: '1', label: '男性' }, { value: '2', label: '女性' }];
    expect(chooseOption(options, synonymsFor('basic.gender', 'male'))).toBe('1');
    expect(chooseOption(options, synonymsFor('basic.gender', 'female'))).toBe('2');
  });
});
