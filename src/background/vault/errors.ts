import { LOCKOUT_MS, MIN_PASSWORD_LENGTH } from '@/shared/constants';

export type VaultErrorCode =
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'WEAK_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'LOCKED_OUT'
  | 'LOCKED'
  | 'CORRUPTED'
  | 'INVALID_DATA';

const MESSAGES: Record<VaultErrorCode, string> = {
  NOT_INITIALIZED: '尚未设置主密码',
  ALREADY_INITIALIZED: '主密码已设置，不能重复初始化',
  WEAK_PASSWORD: `主密码至少需要 ${MIN_PASSWORD_LENGTH} 位`,
  WRONG_PASSWORD: '主密码错误',
  LOCKED_OUT: `尝试次数过多，请 ${LOCKOUT_MS / 1000} 秒后再试`,
  LOCKED: '数据已上锁，请先解锁',
  CORRUPTED: '数据已损坏，请从备份导入',
  INVALID_DATA: '数据格式不正确',
};

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}：${detail}` : MESSAGES[code]);
    this.name = 'VaultError';
  }
}
