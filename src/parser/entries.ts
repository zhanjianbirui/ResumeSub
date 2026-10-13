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

/** 不以项目符号开头、且包含日期范围的行，视为一个新条目的头行。 */
export function splitEntries(lines: readonly TextLine[]): { entries: Entry[]; orphans: TextLine[] } {
  const entries: Entry[] = [];
  const orphans: TextLine[] = [];
  for (const line of lines) {
    const text = lineText(line);
    const range = isBullet(text) ? null : findDateRange(text);
    if (range) entries.push({ head: line, range, subs: [], bullets: [] });
    else if (entries.length === 0) orphans.push(line);
    else entries[entries.length - 1] = appendLine(entries[entries.length - 1] as Entry, line);
  }
  return { entries, orphans };
}
