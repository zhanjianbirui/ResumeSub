import type { Award } from '@/shared/schema/profile';
import type { TextLine } from '@/shared/text-line';
import { findMonth } from './dates';
import { mergeBullets } from './entries';
import type { Parsed } from './types';

const ITEM_SPLIT = /\s+·\s+|\s*[；;]\s*/;
const LEVEL = /(国家级|省级|市级|校级|院级|international|national|provincial)/i;

const toAward = (text: string): Award => ({ name: text, date: findMonth(text), level: LEVEL.exec(text)?.[1] });

export function parseAwards(lines: readonly TextLine[]): Parsed<Award[]> {
  const items = mergeBullets(lines)
    .flatMap((text) => text.split(ITEM_SPLIT))
    .map((s) => s.trim())
    .filter(Boolean);
  return { value: items.map(toAward), warnings: [] };
}
