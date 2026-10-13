import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextLine } from '@/shared/text-line';
import { groupLines } from './group-lines';
import { type PdfJsLike, readPdfItems } from './pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdf(file: Blob): Promise<TextLine[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  // pdf.js 的完整类型包含 marked-content 条目，结构上与 PdfJsLike 不直接兼容；运行时行为一致
  return groupLines(await readPdfItems(data, pdfjs as unknown as PdfJsLike));
}
