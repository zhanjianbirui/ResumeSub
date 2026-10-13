import type { TextLine } from '@/shared/text-line';

const OPEN = '（([';
const CLOSE = '）)]';
const LIST_SEPARATORS = '、,，;；';

/** 按顿号、逗号、分号切分列表，括号内的分隔符不切。 */
export function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (OPEN.includes(ch)) depth += 1;
    if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && LIST_SEPARATORS.includes(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  return [...parts, current].map((p) => p.trim()).filter(Boolean);
}

export function splitOnce(text: string, pattern: RegExp): [string, string] | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()];
}

/** 多片段行：前面的片段为正文，最后一个片段通常是右对齐的地点、角色等。 */
export function splitTrailing(line: TextLine): [string, string | undefined] {
  if (line.segments.length < 2) return [line.segments[0] ?? '', undefined];
  return [line.segments.slice(0, -1).join(' '), line.segments[line.segments.length - 1]];
}

export function splitLocation(text: string): { city?: string; country?: string } {
  const [city, ...rest] = text.split(/\s*[,，]\s*/).filter(Boolean);
  return { city, country: rest.length > 0 ? rest.join(', ') : undefined };
}
