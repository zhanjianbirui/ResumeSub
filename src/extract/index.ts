import { ImportError } from '@/import/errors';
import { RESUME_MIMES } from '@/shared/constants';
import type { TextLine } from '@/shared/text-line';

export type ResumeKind = keyof typeof RESUME_MIMES;

export function detectKind(file: { name: string; type: string }): ResumeKind | null {
  const name = file.name.toLowerCase();
  if (file.type === RESUME_MIMES.pdf || name.endsWith('.pdf')) return 'pdf';
  if (file.type === RESUME_MIMES.docx || name.endsWith('.docx')) return 'docx';
  return null;
}

/** 解析库体积大，按需动态加载，确保只进入 options 页的 chunk。 */
export async function extractLines(file: File): Promise<TextLine[]> {
  const kind = detectKind(file);
  if (kind === 'pdf') return (await import('./pdf-browser')).extractPdf(file);
  if (kind === 'docx') return (await import('./docx')).extractDocx(file);
  throw new ImportError('UNSUPPORTED_TYPE');
}
