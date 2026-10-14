export const IV_BYTES = 12;
export const VAULT_CHECK_TEXT = 'resumesub-vault-ok';

export const STORAGE_KEYS = {
  vault: 'vault',
  deviceKey: 'deviceKey',
  /** 旧版（主密码时代）遗留的键，清空数据时一并删除。 */
  legacy: ['prefs', 'pendingTabs'],
} as const;

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_BASE64 = Math.ceil(MAX_RESUME_BYTES / 3) * 4;
export const RESUME_MIMES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

/** 解析输入上限：防止超长文档或异常行拖慢本地解析。 */
export const MAX_RESUME_PAGES = 10;
export const MAX_LINE_CHARS = 500;
export const MAX_TEXT_CHARS = 100_000;
