import { describe, expect, it } from 'vitest';
import { createVault } from '@/background/vault/vault';
import { STORAGE_KEYS } from '@/shared/constants';
import { emptyEducation } from '@/shared/schema/profile';
import { emptyVaultData } from '@/shared/schema/vault-data';
import { memoryArea } from '../helpers/memory-area';

const withName = (name: string) => (data: ReturnType<typeof emptyVaultData>) => ({
  ...data, profile: { ...data.profile, basic: { ...data.profile.basic, name } },
});

describe('vault (no password)', () => {
  it('reads empty data before anything is saved and needs no setup', async () => {
    const vault = createVault({ local: memoryArea() });
    expect(await vault.state()).toBe('ready');
    expect(await vault.read()).toEqual(emptyVaultData());
  });

  it('persists encrypted data with an auto-generated device key', async () => {
    const local = memoryArea();
    await createVault({ local }).update(withName('李四测试'));
    expect(typeof (await local.get(STORAGE_KEYS.deviceKey))).toBe('string');
    expect(JSON.stringify(await local.get(STORAGE_KEYS.vault))).not.toContain('李四测试');
    // 新的 vault 实例（模拟 service worker 重启）用同一把本机密钥读回
    expect((await createVault({ local }).read()).profile.basic.name).toBe('李四测试');
  });

  it('serialises concurrent updates so none is lost', async () => {
    const vault = createVault({ local: memoryArea() });
    await Promise.all([
      vault.update((d) => ({ ...d, profile: { ...d.profile, custom: { ...d.profile.custom, a: '1' } } })),
      vault.update((d) => ({ ...d, profile: { ...d.profile, custom: { ...d.profile.custom, b: '2' } } })),
    ]);
    expect((await vault.read()).profile.custom).toEqual({ a: '1', b: '2' });
  });

  it('rejects invalid data', async () => {
    const vault = createVault({ local: memoryArea() });
    const bad = (d: ReturnType<typeof emptyVaultData>) => ({
      ...d, profile: { ...d.profile, education: [{ ...emptyEducation(), start: '2025/09' }] },
    });
    await expect(vault.update(bad)).rejects.toMatchObject({ code: 'INVALID_DATA' });
  });

  it('detects a legacy password vault and clears it (plus old keys) on reset', async () => {
    const local = memoryArea();
    await local.set(STORAGE_KEYS.vault, { v: 1, salt: 's', iterations: 1, check: { iv: '', ct: '' }, data: { iv: '', ct: '' } });
    await local.set('prefs', { autoLockMinutes: 60 });
    const vault = createVault({ local });
    expect(await vault.state()).toBe('legacy');
    await expect(vault.read()).rejects.toMatchObject({ code: 'LEGACY' });
    await expect(vault.update(withName('x'))).rejects.toMatchObject({ code: 'LEGACY' });
    await vault.reset();
    expect(await local.get('prefs')).toBeUndefined();
    expect(await vault.state()).toBe('ready');
    expect(await vault.read()).toEqual(emptyVaultData());
  });

  it('reports CORRUPTED for garbage in storage', async () => {
    const local = memoryArea();
    await local.set(STORAGE_KEYS.vault, { nope: true });
    await expect(createVault({ local }).read()).rejects.toMatchObject({ code: 'CORRUPTED' });
  });
});
