export type DegreeCode = '' | 'highschool' | 'associate' | 'bachelor' | 'master' | 'phd';

const RULES: readonly (readonly [Exclude<DegreeCode, ''>, RegExp])[] = [
  ['phd', /博士|ph\.?\s?d\b|\bdoctor(?:ate)?\b/i],
  ['master', /硕士|研究生|\bmaster|\bm\.?sc\b|\bmeng\b|\bmphil\b|\bmba\b|\bm\.?a\.?(?=\s|$)|\bm\.s\.?/i],
  ['bachelor', /本科|学士|\bbachelor|\bb\.?sc\b|\bbeng\b|\bb\.?a\.?(?=\s|$)|\bb\.s\.?/i],
  ['associate', /大专|专科|\bassociate/i],
  ['highschool', /高中|high school/i],
];

const DEGREE_WORDS = new RegExp(
  [
    String.raw`(?:理学|工学|文学|管理学|经济学|法学|医学|教育学|艺术学|农学|哲学|历史学)?(?:学士|硕士|博士)(?:学位|研究生)?`,
    String.raw`本科|研究生|大专|专科`,
    String.raw`\b(?:Bachelor|Master|Doctor)(?:'s)?(?:\s+of\s+[A-Z][a-z]+)?(?:\s+degree)?`,
    String.raw`\b(?:B\.?Sc|BEng|B\.?A|B\.?S|M\.?Sc|MEng|MPhil|M\.?A|M\.?S|MBA|Ph\.?\s?D)\b\.?`,
  ].join('|'),
  'gi',
);

const EDGE_PUNCT = /^[\s–—\-|｜·,，]+|[\s–—\-|｜·,，]+$/g;

export function detectDegree(text: string): DegreeCode {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? '';
}

/** 去掉学位词、括号注释（如“在读”）和首尾分隔符，剩下的就是专业名。 */
export function stripDegree(text: string): string {
  return text
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(DEGREE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCT, '')
    .replace(/^(?:in|of)\s+/i, '')
    .trim();
}
