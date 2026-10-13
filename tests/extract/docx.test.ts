import { describe, expect, it, vi } from 'vitest';
import { extractDocx, paragraphsToLines } from '@/extract/docx';
import { detectKind, extractLines } from '@/extract/index';
import { MAX_TEXT_CHARS } from '@/shared/constants';
import { makeDocx } from '../helpers/make-docx';

// 浏览器构建的 mammoth 接受 { arrayBuffer }，Node 构建只接受 { buffer }；这里只做入参转换，解析仍由真实 mammoth 完成
vi.mock('mammoth', async (importOriginal) => {
  const real = await importOriginal<typeof import('mammoth')>();
  return {
    ...real,
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => real.extractRawText({ buffer: Buffer.from(input.arrayBuffer) }),
  };
});

describe('paragraphsToLines', () => {
  it('splits paragraphs into lines and tabs into segments, skipping blanks', () => {
    const lines = paragraphsToLines('张三\n\n示例大学\t\t2021.09 – 2025.06\n  \n');
    expect(lines.map((l) => l.segments)).toEqual([['张三'], ['示例大学', '2021.09 – 2025.06']]);
    expect(lines[0]?.y).toBeGreaterThan(lines[1]?.y ?? 0);
  });
});

describe('extractDocx', () => {
  it('extracts paragraphs and tab-separated segments from a real .docx', async () => {
    const bytes = await makeDocx([['张三'], ['示例大学', '2021.09 – 2025.06']]);
    const lines = await extractDocx(new Blob([bytes]));
    expect(lines.map((l) => l.segments)).toEqual([['张三'], ['示例大学', '2021.09 – 2025.06']]);
  });

  it('rejects documents whose text exceeds the limit', async () => {
    const bytes = await makeDocx([['a'.repeat(MAX_TEXT_CHARS + 1)]]);
    await expect(extractDocx(new Blob([bytes]))).rejects.toMatchObject({ code: 'TOO_LARGE' });
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
