const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const TOKEN = new RegExp(
  [
    String.raw`(\d{4})\s*[./\-年]\s*(1[0-2]|0?[1-9])(?!\d)\s*月?`,
    String.raw`\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})`,
    String.raw`(至今|现在|目前|\bpresent\b|\bnow\b|\bcurrent\b)`,
    String.raw`(?<!\d)((?:19|20)\d{2})(?!\d)`,
  ].join('|'),
  'gi',
);
const SEPARATOR = /^\s*(?:-|–|—|~|～|至|to)\s*$/i;

interface Token {
  value: string;
  kind: 'month' | 'year' | 'present';
  start: number;
  end: number;
}

export interface DateRange {
  start: string;
  end: string;
  approximate: boolean;
  index: number;
  length: number;
}

const pad = (n: number | string | undefined) => String(n ?? '').padStart(2, '0');

function toToken(m: RegExpMatchArray): Token {
  const start = m.index ?? 0;
  const end = start + m[0].length;
  if (m[1]) return { value: `${m[1]}-${pad(m[2])}`, kind: 'month', start, end };
  if (m[3]) return { value: `${m[4]}-${pad(MONTHS[m[3].toLowerCase()])}`, kind: 'month', start, end };
  if (m[5]) return { value: 'present', kind: 'present', start, end };
  return { value: m[6] ?? '', kind: 'year', start, end };
}

const tokensOf = (text: string): Token[] => [...text.matchAll(TOKEN)].map(toToken);

export function findDateRange(text: string): DateRange | null {
  const tokens = tokensOf(text);
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!a || !b || a.kind === 'present' || !SEPARATOR.test(text.slice(a.end, b.start))) continue;
    return {
      start: a.kind === 'year' ? `${a.value}-01` : a.value,
      end: b.kind === 'year' ? `${b.value}-12` : b.value,
      approximate: a.kind === 'year' || b.kind === 'year',
      index: a.start,
      length: b.end - a.start,
    };
  }
  return null;
}

export function removeRange(text: string, range: DateRange): string {
  return `${text.slice(0, range.index)} ${text.slice(range.index + range.length)}`.replace(/\s+/g, ' ').trim();
}

export function findMonth(text: string): string | undefined {
  return tokensOf(text).find((t) => t.kind === 'month')?.value;
}
