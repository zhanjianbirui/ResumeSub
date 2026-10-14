import { describe, expect, it } from 'vitest';
import { classifyBlob, exportRawKey, generateKey, importRawKey, openVault, sealVault } from '@/background/vault/crypto';

describe('vault crypto (v2, device key)', () => {
  it('roundtrips JSON data with fresh IVs', async () => {
    const key = await generateKey();
    const a = await sealVault(key, { hello: '世界' });
    const b = await sealVault(key, { hello: '世界' });
    expect(a.v).toBe(2);
    expect(a.data.iv).not.toBe(b.data.iv);
    expect(await openVault(key, a)).toEqual({ hello: '世界' });
  });

  it('reports CORRUPTED for a different key or tampered data', async () => {
    const blob = await sealVault(await generateKey(), { a: 1 });
    await expect(openVault(await generateKey(), blob)).rejects.toMatchObject({ code: 'CORRUPTED' });
    const key = await generateKey();
    const good = await sealVault(key, { a: 1 });
    const ct = good.data.ct;
    const tampered = { ...good, data: { ...good.data, ct: (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1) } };
    await expect(openVault(key, tampered)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });

  it('exports and re-imports the raw key', async () => {
    const key = await generateKey();
    const blob = await sealVault(key, 'x');
    expect(await openVault(await importRawKey(await exportRawKey(key)), blob)).toBe('x');
  });

  it('classifies v1 (password-era) blobs as legacy and rejects garbage', async () => {
    expect(classifyBlob({ v: 1, salt: 's', iterations: 1, check: {}, data: {} })).toEqual({ kind: 'legacy' });
    expect(classifyBlob(await sealVault(await generateKey(), 1)).kind).toBe('current');
    expect(() => classifyBlob({ nope: true })).toThrow(expect.objectContaining({ code: 'CORRUPTED' }));
  });
});
