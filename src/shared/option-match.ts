import type { FieldOption } from '@/shared/autofill-types';

const PLACEHOLDER = /^(?:请选择|select|choose|--|-|—)/i;
const CJK = /[㐀-鿿]/;
const TOKEN = /[a-z0-9'’]+|[㐀-鿿]+/g;
const keyOf = (text: string) => text.toLowerCase().replace(/[\s'’.\-_()（）]/g, '');
const tokensOf = (text: string) => (text.toLowerCase().match(TOKEN) ?? []).map(keyOf);
const MIN_LOOSE = 2;
/** 包含式匹配后剩下的修饰词表示"更高/以上"的另一档（博士后、研究生及以上），不能当成同一学历。 */
const QUALIFIER = /后|以上/;

/** 中文选项允许包含式匹配（"硕士研究生"包含"硕士"）；拉丁文字只允许整词匹配，避免 "Female" 包含 "male"。 */
function looseHit(label: string, key: string): boolean {
  if (key.length < MIN_LOOSE || label.length < MIN_LOOSE) return false;
  if (!CJK.test(label) || !CJK.test(key)) return false;
  if (label.includes(key)) return !QUALIFIER.test(label.replace(key, ''));
  return key.includes(label);
}

/**
 * 依次尝试：整段精确匹配（选项文字或 value）→ 选项中的某个词精确匹配 → 中文包含式匹配。
 * 少于 2 个字符的词只参与整段精确匹配。
 */
export function chooseOption(options: readonly FieldOption[], wanted: readonly string[]): string | null {
  const candidates = options.filter((o) => o.value !== '' && !PLACEHOLDER.test(o.label.trim()));
  const keys = wanted.map(keyOf).filter(Boolean);
  const exact = candidates.find((o) => keys.includes(keyOf(o.label)) || keys.includes(keyOf(o.value)));
  if (exact) return exact.value;
  const longKeys = keys.filter((k) => k.length >= MIN_LOOSE);
  const token = candidates.find((o) => tokensOf(o.label).some((t) => longKeys.includes(t)));
  if (token) return token.value;
  const loose = candidates.find((o) => longKeys.some((k) => looseHit(keyOf(o.label), k)));
  return loose?.value ?? null;
}
