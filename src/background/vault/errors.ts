export type VaultErrorCode = 'LEGACY' | 'CORRUPTED' | 'INVALID_DATA';

const MESSAGES: Record<VaultErrorCode, string> = {
  LEGACY: '检测到旧版（使用主密码）的档案，无法自动读取：请在设置 → 数据与隐私中清空后重新导入简历',
  CORRUPTED: '档案数据已损坏：请在设置 → 数据与隐私中清空后重新导入简历',
  INVALID_DATA: '数据格式不正确',
};

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}：${detail}` : MESSAGES[code]);
    this.name = 'VaultError';
  }
}
