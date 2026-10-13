import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import {
  deriveKey, exportRawKey, importRawKey, openVault, parseBlob, randomBytes, sealVault,
} from '@/background/vault/crypto';

const ITER = 1000;

async function makeKey(password = 'test-password-1') {
  const salt = bytesToBase64(randomBytes(16));
  return { salt, key: await deriveKey(password, base64ToBytes(salt), ITER) };
}

describe('vault crypto', () => {
  it('roundtrips JSON data', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, { hello: '世界' });
    expect(await openVault(key, blob)).toEqual({ hello: '世界' });
    expect(blob).toMatchObject({ v: 1, salt, iterations: ITER });
  });

  it('uses a fresh IV for every seal', async () => {
    const { key, salt } = await makeKey();
    const a = await sealVault(key, salt, ITER, 1);
    const b = await sealVault(key, salt, ITER, 1);
    expect(a.data.iv).not.toBe(b.data.iv);
    expect(a.check.iv).not.toBe(a.data.iv);
  });

  it('reports WRONG_PASSWORD for a different key', async () => {
    const { key, salt } = await makeKey('right-password');
    const blob = await sealVault(key, salt, ITER, {});
    const wrong = await deriveKey('wrong-password', base64ToBytes(salt), ITER);
    await expect(openVault(wrong, blob)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('reports CORRUPTED when data ciphertext is tampered', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, { a: 1 });
    const ct = blob.data.ct;
    const tampered = { ...blob, data: { ...blob.data, ct: (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1) } };
    await expect(openVault(key, tampered)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });

  it('exports and re-imports the raw key', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, 'x');
    const restored = await importRawKey(await exportRawKey(key));
    expect(await openVault(restored, blob)).toBe('x');
  });

  it('parseBlob rejects malformed input as CORRUPTED', () => {
    expect(() => parseBlob({ v: 1, salt: 1 })).toThrow(expect.objectContaining({ code: 'CORRUPTED' }));
  });
});
