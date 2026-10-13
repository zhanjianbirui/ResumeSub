import type { FieldPath } from './rules';

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  male: ['男', 'male', 'man', '先生', 'm', '男性'],
  female: ['女', 'female', 'woman', '女士', 'f', '女性'],
  highschool: ['高中', 'high school', 'secondary'],
  associate: ['大专', '专科', 'associate'],
  bachelor: ['本科', '学士', 'bachelor', "bachelor's", 'undergraduate', 'bsc'],
  master: ['硕士', '研究生', 'master', "master's", 'postgraduate', 'msc'],
  phd: ['博士', 'phd', 'doctor', 'doctorate'],
};

export function synonymsFor(path: FieldPath, raw: string): string[] {
  if (path === 'basic.gender' || path === 'education.degree') return [...(SYNONYMS[raw] ?? [raw])];
  return [raw];
}

export { chooseOption } from '@/shared/option-match';
