import { expect, it, vi } from 'vitest';
import { groupLines } from '@/extract/group-lines';
import { type PdfJsLike, readPdfItems } from '@/extract/pdf';
import { MAX_RESUME_PAGES } from '@/shared/constants';
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

it('rejects documents over the page limit before reading any page', async () => {
  const getPage = vi.fn();
  const destroy = vi.fn(async () => {});
  const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: MAX_RESUME_PAGES + 1, getPage }), destroy }));
  const pdfjs: PdfJsLike = { getDocument };
  await expect(readPdfItems(new Uint8Array(), pdfjs)).rejects.toMatchObject({
    code: 'TOO_MANY_PAGES', message: `简历超过 ${MAX_RESUME_PAGES} 页，请上传精简后的版本`,
  });
  expect(getPage).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalled();
  expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false }));
});
