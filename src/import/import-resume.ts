import { detectKind, extractLines } from '@/extract/index';
import { parseResume } from '@/parser/parse-resume';
import type { ParseResult } from '@/parser/types';
import { bytesToBase64 } from '@/shared/base64';
import { MAX_RESUME_BYTES, RESUME_MIMES } from '@/shared/constants';
import type { ResumeFile } from '@/shared/schema/vault-data';
import type { TextLine } from '@/shared/text-line';
import { ImportError } from './errors';

export interface ImportResult {
  parse: ParseResult;
  file: ResumeFile;
}

export async function importResume(
  file: File,
  extract: (file: File) => Promise<TextLine[]> = extractLines,
): Promise<ImportResult> {
  const kind = detectKind(file);
  if (!kind) throw new ImportError('UNSUPPORTED_TYPE');
  if (file.size > MAX_RESUME_BYTES) throw new ImportError('TOO_LARGE');
  const lines = await extract(file).catch((error: unknown) => {
    if (error instanceof ImportError) throw error;
    console.error('[ResumeSub] resume extraction failed', error);
    throw new ImportError('READ_FAILED');
  });
  if (lines.length === 0) throw new ImportError('NO_TEXT');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    parse: parseResume(lines),
    file: { name: file.name, mime: RESUME_MIMES[kind], dataBase64: bytesToBase64(bytes) },
  };
}
