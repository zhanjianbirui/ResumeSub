import { lineText, type TextLine } from '@/shared/text-line';
import { type DateRange, findDateRange, removeRange } from './dates';

export interface Entry {
  head: TextLine;
  range: DateRange | null;
  subs: TextLine[];
  bullets: string[];
}

const BULLET = /^\s*(?:[•·▪●◦■□➢►*]|[-–](?=\s)|\d{1,2}[.)、](?=\s|[^\d]))\s*/;

export const isBullet = (text: string): boolean => BULLET.test(text);
export const stripBullet = (text: string): string => text.replace(BULLET, '').trim();

/** 换行续接：两侧都是拉丁字母或数字时补空格，中文直接拼接。 */
export function joinWrapped(prev: string, next: string): string {
  const needsSpace = /[A-Za-z0-9,.;:)]$/.test(prev) && /^[A-Za-z(]/.test(next);
  return needsSpace ? `${prev} ${next}` : `${prev}${next}`;
}

export function mergeBullets(lines: readonly TextLine[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const text = lineText(line);
    if (isBullet(text) || items.length === 0) items.push(stripBullet(text));
    else items[items.length - 1] = joinWrapped(items[items.length - 1] ?? '', text.trim());
  }
  return items.filter(Boolean);
}

export function entryTitle(entry: Entry): string {
  const text = lineText(entry.head);
  return entry.range ? removeRange(text, entry.range) : text.trim();
}

function appendLine(entry: Entry, line: TextLine): Entry {
  const text = lineText(line);
  if (isBullet(text)) return { ...entry, bullets: [...entry.bullets, stripBullet(text)] };
  if (entry.bullets.length > 0) {
    const last = entry.bullets[entry.bullets.length - 1] ?? '';
    return { ...entry, bullets: [...entry.bullets.slice(0, -1), joinWrapped(last, text.trim())] };
  }
  return { ...entry, subs: [...entry.subs, line] };
}

const NUMBERED = /^\s*\d{1,2}[.)、](?=\s|[^\d])\s*/;

/** 编号行（“1. 项目名 2023.03 - 2023.06”）去掉编号后可以作为条目头行。 */
function stripNumbering(line: TextLine): TextLine {
  const [first = '', ...rest] = line.segments;
  return { ...line, segments: [first.replace(NUMBERED, '').trim(), ...rest].filter(Boolean) };
}

/** 判断一行能否作为新条目的头行；返回头行（编号已去掉）和日期范围。 */
function asHead(line: TextLine, current: Entry | undefined): { head: TextLine; range: DateRange } | null {
  const text = lineText(line);
  if (NUMBERED.test(text)) {
    const head = stripNumbering(line);
    const range = findDateRange(lineText(head));
    return range ? { head, range } : null;
  }
  if (isBullet(text)) return null;
  const range = findDateRange(text);
  if (!range) return null;
  // 已有要点时，单片段且只有年份的行更可能是要点的换行续接（如“2019 - 2020 版本迁移”）
  const continuesBullet = Boolean(current && current.bullets.length > 0) && line.segments.length < 2;
  return continuesBullet && range.approximate ? null : { head: line, range };
}

/** 不以项目符号开头（编号行除外）、且包含日期范围的行，视为一个新条目的头行。 */
export function splitEntries(lines: readonly TextLine[]): { entries: Entry[]; orphans: TextLine[] } {
  const entries: Entry[] = [];
  const orphans: TextLine[] = [];
  for (const line of lines) {
    const current = entries[entries.length - 1];
    const head = asHead(line, current);
    if (head) entries.push({ ...head, subs: [], bullets: [] });
    else if (!current) orphans.push(line);
    else entries[entries.length - 1] = appendLine(current, line);
  }
  return { entries, orphans };
}
