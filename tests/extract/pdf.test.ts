import { expect, it } from 'vitest';
import { groupLines } from '@/extract/group-lines';
import { type PdfJsLike, readPdfItems } from '@/extract/pdf';
import { makePdf } from '../helpers/make-pdf';

it('extracts positioned text from a real PDF via pdf.js', async () => {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
  const data = makePdf([
    { x: 50, y: 800, size: 16, text: 'Alex Chen' },
    { x: 50, y: 770, size: 10, text: 'Example University' },
    { x: 450, y: 770, size: 10, text: 'Sep 2024 - Jun 2025' },
  ]);
  const lines = groupLines(await readPdfItems(data, pdfjs));
  expect(lines.map((l) => l.segments)).toEqual([['Alex Chen'], ['Example University', 'Sep 2024 - Jun 2025']]);
  expect(lines[0]?.size).toBeGreaterThan(lines[1]?.size ?? Infinity);
});
