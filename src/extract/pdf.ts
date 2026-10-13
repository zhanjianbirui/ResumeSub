import type { PositionedText } from './group-lines';

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

/** pdf.js 中我们实际用到的最小接口；浏览器用 pdfjs-dist，测试用它的 legacy 构建。 */
export interface PdfJsLike {
  getDocument(params: { data: Uint8Array; verbosity?: number }): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

function toPositioned(page: number, item: PdfTextItem): PositionedText | null {
  if (typeof item.str !== 'string' || !item.transform) return null;
  const [, , c = 0, d = 0, x = 0, y = 0] = item.transform;
  return { page, x, y, width: item.width ?? 0, size: item.height || Math.hypot(c, d), text: item.str };
}

export async function readPdfItems(data: Uint8Array, pdfjs: PdfJsLike): Promise<PositionedText[]> {
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  try {
    const pages = await Promise.all(
      Array.from({ length: doc.numPages }, async (_, i) => {
        const content = await (await doc.getPage(i + 1)).getTextContent();
        return content.items
          .map((item) => toPositioned(i + 1, item))
          .filter((p): p is PositionedText => p !== null);
      }),
    );
    return pages.flat();
  } finally {
    await task.destroy();
  }
}
