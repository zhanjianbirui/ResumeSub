/** Chrome 导出 PDF 时常把汉字写成部首补充区字符；NFKC 只覆盖康熙部首，这里补齐常见简化部首。 */
const RADICALS: Readonly<Record<string, string>> = {
  '⺟': '母', '⺰': '纟', '⻄': '西', '⻅': '见', '⻆': '角', '⻈': '讠', '⻉': '贝', '⻋': '车', '⻐': '钅',
  '⻓': '长', '⻔': '门', '⻗': '雨', '⻘': '青', '⻚': '页', '⻛': '风', '⻜': '飞', '⻝': '食', '⻠': '饣',
  '⻢': '马', '⻥': '鱼', '⻦': '鸟', '⻧': '卤', '⻨': '麦', '⻩': '黄', '⻬': '齐', '⻮': '齿', '⻰': '龙', '⻳': '龟',
};
const RADICAL_PATTERN = new RegExp(`[${Object.keys(RADICALS).join('')}]`, 'g');
/** 只合并“单字 空格 单字”的连续串（拆字形导出的典型形态），不合并以空格分隔的词。 */
const CJK_GAP = /(?<![㐀-鿿])[㐀-鿿](?:\s[㐀-鿿])+(?![㐀-鿿])/g;

export function normalizeText(text: string): string {
  return text
    .replace(/[⼀-⿕]/g, (ch) => ch.normalize('NFKC'))
    .replace(RADICAL_PATTERN, (ch) => RADICALS[ch] ?? ch)
    .replace(CJK_GAP, (run) => run.replace(/\s/g, ''));
}
