import { ImportError } from '@/import/errors';
import { MAX_TEXT_CHARS } from '@/shared/constants';
import type { TextLine } from '@/shared/text-line';

/** Word 简历常用 Tab 把日期推到右侧，所以 Tab 视为片段分隔。 */
export function paragraphsToLines(raw: string): TextLine[] {
  return raw
    .split(/\r?\n/)
    .map((paragraph) => paragraph.split(/\t+/).map((s) => s.trim()).filter(Boolean))
    .filter((segments) => segments.length > 0)
    .map((segments, i) => ({ page: 1, y: -i, size: 0, segments }));
}

export async function extractDocx(file: Blob): Promise<TextLine[]> {
  const { extractRawText } = await import('mammoth');
  const { value } = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
  if (value.length > MAX_TEXT_CHARS) throw new ImportError('TOO_LARGE');
  return paragraphsToLines(value);
}
