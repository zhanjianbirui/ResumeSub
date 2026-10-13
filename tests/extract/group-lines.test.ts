import { describe, expect, it } from 'vitest';
import { groupLines, type PositionedText } from '@/extract/group-lines';
import { lineText } from '@/shared/text-line';

const item = (text: string, x: number, y: number, extra: Partial<PositionedText> = {}): PositionedText => ({
  page: 1, x, y, width: text.length * 5, size: 10, text, ...extra,
});

describe('groupLines', () => {
  it('joins close items with a space and splits far items into segments', () => {
    const lines = groupLines([
      item('Hello', 0, 700),
      item('World', 27, 700),
      item('2024 - 2025', 400, 700),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.segments).toEqual(['Hello World', '2024 - 2025']);
  });

  it('orders lines top-to-bottom and pages ascending, tolerating y jitter', () => {
    const lines = groupLines([
      item('second', 0, 680),
      item('first-b', 60, 699.2),
      item('first-a', 0, 700),
      item('page2', 0, 800, { page: 2 }),
    ]);
    expect(lines.map(lineText)).toEqual(['first-a first-b', 'second', 'page2']);
  });

  it('drops whitespace-only items and records the largest font size', () => {
    const lines = groupLines([item('   ', 0, 700), item('Name', 0, 700, { size: 18 }), item('x', 30, 700)]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.size).toBe(18);
  });

  it('returns no lines for no items', () => {
    expect(groupLines([])).toEqual([]);
  });

  it('handles a line with a very large number of items without overflowing the stack', () => {
    const many = Array.from({ length: 200_000 }, (_, i) => item('a', i * 5, 700));
    expect(groupLines(many)).toHaveLength(1);
  });
});
