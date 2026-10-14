import * as v from 'valibot';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import { IV_BYTES, VAULT_CHECK_TEXT } from '@/shared/constants';
import { VaultError } from './errors';

const SealedSchema = v.object({ iv: v.string(), ct: v.string() });

/** v2：密钥由插件自动生成并保存在本机（无主密码）。check 用来识别密钥不匹配。 */
export const EncryptedBlobSchema = v.object({
  v: v.literal(2),
  check: SealedSchema,
  data: SealedSchema,
});

export type EncryptedBlob = v.InferOutput<typeof EncryptedBlobSchema>;
type Sealed = v.InferOutput<typeof SealedSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const AES = { name: 'AES-GCM', length: 256 } as const;

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
}

async function seal(key: CryptoKey, plaintext: string): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

async function unseal(key: CryptoKey, sealed: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(sealed.iv) },
    key,
    base64ToBytes(sealed.ct),
  );
  return decoder.decode(pt);
}

export async function sealVault(key: CryptoKey, data: unknown): Promise<EncryptedBlob> {
  return { v: 2, check: await seal(key, VAULT_CHECK_TEXT), data: await seal(key, JSON.stringify(data)) };
}

/** 密钥不匹配或密文被改动时都视为数据损坏（无密码模式下不存在"密码错误"）。 */
export async function openVault(key: CryptoKey, blob: EncryptedBlob): Promise<unknown> {
  const check = await unseal(key, blob.check).catch(() => null);
  if (check !== VAULT_CHECK_TEXT) throw new VaultError('CORRUPTED');
  try {
    return JSON.parse(await unseal(key, blob.data));
  } catch {
    throw new VaultError('CORRUPTED');
  }
}

export type StoredBlob = { kind: 'current'; blob: EncryptedBlob } | { kind: 'legacy' };

/** 识别存储里的密文：v2 为当前格式；v1（旧版主密码加密）只能清空重来。 */
export function classifyBlob(raw: unknown): StoredBlob {
  if (typeof raw === 'object' && raw !== null && (raw as { v?: unknown }).v === 1) return { kind: 'legacy' };
  const result = v.safeParse(EncryptedBlobSchema, raw);
  if (!result.success) throw new VaultError('CORRUPTED');
  return { kind: 'current', blob: result.output };
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importRawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), AES, false, ['encrypt', 'decrypt']);
}
