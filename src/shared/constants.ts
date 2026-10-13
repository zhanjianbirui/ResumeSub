export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000;
export const AUTO_LOCK_ALARM = 'vault-auto-lock';
export const VAULT_CHECK_TEXT = 'resumesub-vault-ok';

export const STORAGE_KEYS = {
  vault: 'vault',
  prefs: 'prefs',
  sessionKey: 'vaultKey',
  lockout: 'lockout',
} as const;

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export const MAX_RESUME_BASE64 = Math.ceil(MAX_RESUME_BYTES / 3) * 4;
export const RESUME_MIMES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
