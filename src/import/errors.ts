import { MAX_RESUME_BYTES, MAX_RESUME_PAGES } from '@/shared/constants';

export type ImportErrorCode = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'TOO_MANY_PAGES' | 'NO_TEXT' | 'READ_FAILED';

const MESSAGES: Record<ImportErrorCode, string> = {
  UNSUPPORTED_TYPE: '仅支持 PDF 或 DOCX 格式的简历',
  TOO_LARGE: `文件过大，请上传 ${MAX_RESUME_BYTES / 1024 / 1024}MB 以内的简历`,
  TOO_MANY_PAGES: `简历超过 ${MAX_RESUME_PAGES} 页，请上传精简后的版本`,
  NO_TEXT: '未识别到文字：这可能是扫描件，请使用含文字的 PDF，或之后使用 AI 解析',
  READ_FAILED: '读取文件失败，请确认文件未损坏',
};

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ImportError';
  }
}
