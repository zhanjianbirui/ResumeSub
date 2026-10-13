import * as v from 'valibot';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import { IV_BYTES, VAULT_CHECK_TEXT } from '@/shared/constants';
import { VaultError } from './errors';

const SealedSchema = v.object({ iv: v.string(), ct: v.string() });

export const EncryptedBlobSchema = v.object({
  v: v.literal(1),
  salt: v.string(),
  iterations: v.pipe(v.number(), v.integer(), v.minValue(1)),
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

export async function deriveKey(password: string, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    AES,
    true,
    ['encrypt', 'decrypt'],
  );
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

export async function sealVault(
  key: CryptoKey,
  saltB64: string,
  iterations: number,
  data: unknown,
): Promise<EncryptedBlob> {
  return {
    v: 1,
    salt: saltB64,
    iterations,
    check: await seal(key, VAULT_CHECK_TEXT),
    data: await seal(key, JSON.stringify(data)),
  };
}

export async function openVault(key: CryptoKey, blob: EncryptedBlob): Promise<unknown> {
  const check = await unseal(key, blob.check).catch(() => null);
  if (check !== VAULT_CHECK_TEXT) throw new VaultError('WRONG_PASSWORD');
  try {
    return JSON.parse(await unseal(key, blob.data));
  } catch {
    throw new VaultError('CORRUPTED');
  }
}

export function parseBlob(raw: unknown): EncryptedBlob {
  const result = v.safeParse(EncryptedBlobSchema, raw);
  if (!result.success) throw new VaultError('CORRUPTED');
  return result.output;
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importRawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), AES, false, ['encrypt', 'decrypt']);
}
