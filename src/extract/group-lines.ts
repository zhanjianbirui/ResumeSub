import type { TextLine } from '@/shared/text-line';

export interface PositionedText {
  page: number;
  x: number;
  y: number;
  width: number;
  size: number;
  text: string;
}

/** 间距超过 1.5 倍字号视为新片段（通常是右对齐的日期或地点）；超过 0.15 倍字号补一个空格。 */
const SEGMENT_GAP_EM = 1.5;
const SPACE_GAP_EM = 0.15;

function sameLine(a: PositionedText, b: PositionedText): boolean {
  const tolerance = Math.max(2, Math.min(a.size, b.size) * 0.4);
  return a.page === b.page && Math.abs(a.y - b.y) <= tolerance;
}

function buildLine(items: readonly PositionedText[]): TextLine {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const size = Math.max(...sorted.map((i) => i.size));
  const segments: string[] = [];
  let current = '';
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const gap = item.x - lastEnd;
    if (current && gap > size * SEGMENT_GAP_EM) {
      segments.push(current.trim());
      current = '';
    } else if (current && gap > size * SPACE_GAP_EM && !current.endsWith(' ')) {
      current += ' ';
    }
    current += item.text;
    lastEnd = item.x + item.width;
  }
  segments.push(current.trim());
  const first = sorted[0];
  return { page: first?.page ?? 0, y: first?.y ?? 0, size, segments: segments.filter(Boolean) };
}

export function groupLines(items: readonly PositionedText[]): TextLine[] {
  const ordered = items
    .filter((i) => i.text.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const groups: PositionedText[][] = [];
  for (const item of ordered) {
    const last = groups[groups.length - 1];
    const head = last?.[0];
    if (last && head && sameLine(head, item)) last.push(item);
    else groups.push([item]);
  }
  return groups.map(buildLine).filter((line) => line.segments.length > 0);
}
