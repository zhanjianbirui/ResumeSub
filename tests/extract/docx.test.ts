import { describe, expect, it } from 'vitest';
import { paragraphsToLines } from '@/extract/docx';
import { detectKind, extractLines } from '@/extract/index';

describe('paragraphsToLines', () => {
  it('splits paragraphs into lines and tabs into segments, skipping blanks', () => {
    const lines = paragraphsToLines('张三\n\n示例大学\t\t2021.09 – 2025.06\n  \n');
    expect(lines.map((l) => l.segments)).toEqual([['张三'], ['示例大学', '2021.09 – 2025.06']]);
    expect(lines[0]?.y).toBeGreaterThan(lines[1]?.y ?? 0);
  });
});

describe('detectKind', () => {
  it('detects by mime or extension', () => {
    expect(detectKind({ name: 'a.PDF', type: '' })).toBe('pdf');
    expect(detectKind({ name: 'x', type: 'application/pdf' })).toBe('pdf');
    expect(detectKind({ name: 'cv.docx', type: '' })).toBe('docx');
    expect(detectKind({ name: 'cv.doc', type: 'application/msword' })).toBeNull();
  });

  it('extractLines rejects unsupported files', async () => {
    await expect(extractLines(new File(['x'], 'a.txt'))).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });
});
