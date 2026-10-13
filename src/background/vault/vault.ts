import * as v from 'valibot';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import {
  LOCKOUT_MS, MAX_FAILED_ATTEMPTS, MIN_PASSWORD_LENGTH, PBKDF2_ITERATIONS, SALT_BYTES, STORAGE_KEYS,
} from '@/shared/constants';
import { type VaultData, VaultDataSchema } from '@/shared/schema/vault-data';
import type { KVArea } from '../storage';
import {
  deriveKey, type EncryptedBlob, exportRawKey, importRawKey, openVault, parseBlob, randomBytes, sealVault,
} from './crypto';
import { VaultError } from './errors';

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface VaultDeps {
  local: KVArea;
  session: KVArea;
  now: () => number;
  iterations?: number;
}

const LockoutSchema = v.object({ failures: v.number(), until: v.number() });
type Lockout = v.InferOutput<typeof LockoutSchema>;
const NO_LOCKOUT: Lockout = { failures: 0, until: 0 };

function validate(data: unknown): VaultData {
  const result = v.safeParse(VaultDataSchema, data);
  if (!result.success) throw new VaultError('INVALID_DATA', result.issues[0].message);
  return result.output;
}

export function createVault(deps: VaultDeps) {
  const iterations = deps.iterations ?? PBKDF2_ITERATIONS;

  async function readBlob(): Promise<EncryptedBlob | undefined> {
    const raw = await deps.local.get(STORAGE_KEYS.vault);
    return raw === undefined ? undefined : parseBlob(raw);
  }

  async function requireBlob(): Promise<EncryptedBlob> {
    const blob = await readBlob();
    if (!blob) throw new VaultError('NOT_INITIALIZED');
    return blob;
  }

  async function currentKey(): Promise<CryptoKey | undefined> {
    const raw = await deps.session.get(STORAGE_KEYS.sessionKey);
    return typeof raw === 'string' ? importRawKey(raw) : undefined;
  }

  async function requireKey(): Promise<CryptoKey> {
    const key = await currentKey();
    if (!key) throw new VaultError('LOCKED');
    return key;
  }

  async function rememberKey(key: CryptoKey): Promise<void> {
    await deps.session.set(STORAGE_KEYS.sessionKey, await exportRawKey(key));
  }

  async function getLockout(): Promise<Lockout> {
    const result = v.safeParse(LockoutSchema, await deps.session.get(STORAGE_KEYS.lockout));
    return result.success ? result.output : NO_LOCKOUT;
  }

  async function registerFailure(): Promise<void> {
    const current = await getLockout();
    const failures = current.failures + 1;
    const next: Lockout = failures >= MAX_FAILED_ATTEMPTS
      ? { failures: 0, until: deps.now() + LOCKOUT_MS }
      : { failures, until: current.until };
    await deps.session.set(STORAGE_KEYS.lockout, next);
  }

  async function status(): Promise<VaultStatus> {
    if (!(await readBlob())) return 'uninitialized';
    return (await currentKey()) ? 'unlocked' : 'locked';
  }

  async function setup(password: string, data: VaultData): Promise<void> {
    if (await readBlob()) throw new VaultError('ALREADY_INITIALIZED');
    if (password.length < MIN_PASSWORD_LENGTH) throw new VaultError('WEAK_PASSWORD');
    const valid = validate(data);
    const salt = bytesToBase64(randomBytes(SALT_BYTES));
    const key = await deriveKey(password, base64ToBytes(salt), iterations);
    await deps.local.set(STORAGE_KEYS.vault, await sealVault(key, salt, iterations, valid));
    await rememberKey(key);
  }

  async function unlock(password: string): Promise<void> {
    const blob = await requireBlob();
    if (deps.now() < (await getLockout()).until) throw new VaultError('LOCKED_OUT');
    const key = await deriveKey(password, base64ToBytes(blob.salt), blob.iterations);
    try {
      await openVault(key, blob);
    } catch (error) {
      if (error instanceof VaultError && error.code === 'WRONG_PASSWORD') await registerFailure();
      throw error;
    }
    await deps.session.set(STORAGE_KEYS.lockout, NO_LOCKOUT);
    await rememberKey(key);
  }

  async function lock(): Promise<void> {
    await deps.session.remove(STORAGE_KEYS.sessionKey);
  }

  async function read(): Promise<VaultData> {
    const blob = await requireBlob();
    const raw = await openVault(await requireKey(), blob);
    const result = v.safeParse(VaultDataSchema, raw);
    if (!result.success) throw new VaultError('CORRUPTED');
    return result.output;
  }

  async function write(data: VaultData): Promise<void> {
    const blob = await requireBlob();
    const key = await requireKey();
    const valid = validate(data);
    await deps.local.set(STORAGE_KEYS.vault, await sealVault(key, blob.salt, blob.iterations, valid));
  }

  return { status, setup, unlock, lock, read, write };
}

export type Vault = ReturnType<typeof createVault>;
