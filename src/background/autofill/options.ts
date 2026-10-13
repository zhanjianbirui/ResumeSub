import type { FieldOption } from '@/shared/autofill-types';
import type { FieldPath } from './rules';

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  male: ['男', 'male', 'man', '先生', 'm'],
  female: ['女', 'female', 'woman', '女士', 'f'],
  highschool: ['高中', 'high school', 'secondary'],
  associate: ['大专', '专科', 'associate'],
  bachelor: ['本科', '学士', 'bachelor', "bachelor's", 'undergraduate', 'bsc'],
  master: ['硕士', '研究生', 'master', "master's", 'postgraduate', 'msc'],
  phd: ['博士', 'phd', 'doctor', 'doctorate'],
};

const PLACEHOLDER = /^(?:请选择|select|choose|--|-|—)/i;
const keyOf = (text: string) => text.toLowerCase().replace(/[\s'’.\-_()（）]/g, '');
const MIN_LOOSE = 2;

export function synonymsFor(path: FieldPath, raw: string): string[] {
  if (path === 'basic.gender' || path === 'education.degree') return [...(SYNONYMS[raw] ?? [raw])];
  return [raw];
}

/** 先精确匹配（选项文字或 value），再做包含式模糊匹配；少于 2 个字符的词只做精确匹配。 */
export function chooseOption(options: readonly FieldOption[], wanted: readonly string[]): string | null {
  const candidates = options.filter((o) => o.value !== '' && !PLACEHOLDER.test(o.label.trim()));
  const keys = wanted.map(keyOf).filter(Boolean);
  const exact = candidates.find((o) => keys.includes(keyOf(o.label)) || keys.includes(keyOf(o.value)));
  if (exact) return exact.value;
  const loose = candidates.find((o) => {
    const label = keyOf(o.label);
    return label.length >= MIN_LOOSE
      && keys.some((k) => k.length >= MIN_LOOSE && (label.includes(k) || k.includes(label)));
  });
  return loose?.value ?? null;
}
