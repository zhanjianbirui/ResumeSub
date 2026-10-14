import * as v from 'valibot';
import { STORAGE_KEYS } from '@/shared/constants';
import { emptyVaultData, type VaultData, VaultDataSchema } from '@/shared/schema/vault-data';
import type { KVArea } from '../storage';
import { classifyBlob, exportRawKey, generateKey, importRawKey, openVault, sealVault } from './crypto';
import { VaultError } from './errors';

export type VaultState = 'ready' | 'legacy';

export interface VaultDeps {
  local: KVArea;
}

function validate(data: unknown): VaultData {
  const result = v.safeParse(VaultDataSchema, data);
  if (!result.success) throw new VaultError('INVALID_DATA', result.issues[0].message);
  return result.output;
}

/**
 * 无密码的加密档案：首次使用时自动生成 AES-256 密钥并保存在本机 storage.local。
 * 网页和其他扩展读不到；但能读取本机浏览器数据目录的人可以解开。
 * 所有写操作串行执行，避免并发的读-改-写互相覆盖。
 */
export function createVault(deps: VaultDeps) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task, task);
    queue = next.catch(() => undefined);
    return next;
  };

  async function loadOrCreateKey(): Promise<CryptoKey> {
    const raw = await deps.local.get(STORAGE_KEYS.deviceKey);
    if (typeof raw === 'string') return importRawKey(raw);
    const exported = await exportRawKey(await generateKey());
    await deps.local.set(STORAGE_KEYS.deviceKey, exported);
    return importRawKey(exported);
  }

  // 同一个 service worker 生命周期内只加载一次，也避免首次并发调用各自生成不同的密钥
  let keyPromise: Promise<CryptoKey> | null = null;
  const deviceKey = (): Promise<CryptoKey> => {
    keyPromise ??= loadOrCreateKey().catch((error: unknown) => {
      keyPromise = null;
      throw error;
    });
    return keyPromise;
  };

  async function state(): Promise<VaultState> {
    const raw = await deps.local.get(STORAGE_KEYS.vault);
    return raw !== undefined && classifyBlob(raw).kind === 'legacy' ? 'legacy' : 'ready';
  }

  async function read(): Promise<VaultData> {
    const raw = await deps.local.get(STORAGE_KEYS.vault);
    if (raw === undefined) return emptyVaultData();
    const stored = classifyBlob(raw);
    if (stored.kind === 'legacy') throw new VaultError('LEGACY');
    const result = v.safeParse(VaultDataSchema, await openVault(await deviceKey(), stored.blob));
    if (!result.success) throw new VaultError('CORRUPTED');
    return result.output;
  }

  async function writeUnsafe(data: VaultData): Promise<void> {
    const valid = validate(data);
    await deps.local.set(STORAGE_KEYS.vault, await sealVault(await deviceKey(), valid));
  }

  /** 原子地读-改-写。 */
  function update(change: (current: VaultData) => VaultData): Promise<void> {
    return serial(async () => writeUnsafe(change(await read())));
  }

  /** 清空档案（包括旧版档案和旧版遗留的设置），保留设备密钥。 */
  function reset(): Promise<void> {
    return serial(async () => {
      for (const key of STORAGE_KEYS.legacy) await deps.local.remove(key);
      await deps.local.remove(STORAGE_KEYS.vault);
    });
  }

  return { state, read, update, reset };
}

export type Vault = ReturnType<typeof createVault>;
