import { describe, expect, it } from 'vitest';
import { createVault } from '@/background/vault/vault';
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, STORAGE_KEYS } from '@/shared/constants';
import { emptyEducation } from '@/shared/schema/profile';
import { emptyVaultData, type VaultData } from '@/shared/schema/vault-data';
import { memoryArea } from '../helpers/memory-area';

const PW = 'correct-horse-1';

function setupVault() {
  let clock = 0;
  const local = memoryArea();
  const session = memoryArea();
  const vault = createVault({ local, session, now: () => clock, iterations: 1000 });
  return { vault, local, session, advance: (ms: number) => { clock += ms; } };
}

function withName(name: string): VaultData {
  const data = emptyVaultData();
  return { ...data, profile: { ...data.profile, basic: { ...data.profile.basic, name } } };
}

describe('vault', () => {
  it('starts uninitialized and becomes unlocked after setup', async () => {
    const { vault } = setupVault();
    expect(await vault.status()).toBe('uninitialized');
    await vault.setup(PW, emptyVaultData());
    expect(await vault.status()).toBe('unlocked');
    expect(await vault.read()).toEqual(emptyVaultData());
  });

  it('rejects weak passwords and double setup', async () => {
    const { vault } = setupVault();
    await expect(vault.setup('short', emptyVaultData())).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await vault.setup(PW, emptyVaultData());
    await expect(vault.setup(PW, emptyVaultData())).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
  });

  it('unlock before setup reports NOT_INITIALIZED', async () => {
    const { vault } = setupVault();
    await expect(vault.unlock(PW)).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
  });

  it('lock clears the key; unlock restores access', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, withName('张三'));
    await vault.lock();
    expect(await vault.status()).toBe('locked');
    await expect(vault.read()).rejects.toMatchObject({ code: 'LOCKED' });
    await vault.unlock(PW);
    expect((await vault.read()).profile.basic.name).toBe('张三');
  });

  it('rejects a wrong password', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.lock();
    await expect(vault.unlock('wrong-password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(await vault.status()).toBe('locked');
  });

  it('locks out after repeated failures, then recovers', async () => {
    const { vault, advance } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.lock();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(vault.unlock('wrong-password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    }
    await expect(vault.unlock(PW)).rejects.toMatchObject({ code: 'LOCKED_OUT' });
    advance(LOCKOUT_MS);
    await vault.unlock(PW);
    expect(await vault.status()).toBe('unlocked');
  });

  it('stores only ciphertext', async () => {
    const { vault, local } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.write(withName('李四测试'));
    const stored = JSON.stringify(await local.get(STORAGE_KEYS.vault));
    expect(stored).not.toContain('李四测试');
    expect((await vault.read()).profile.basic.name).toBe('李四测试');
  });

  it('write rejects invalid data', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, emptyVaultData());
    const data = emptyVaultData();
    const bad = { ...data, profile: { ...data.profile, education: [{ ...emptyEducation(), start: '2025/09' }] } };
    await expect(vault.write(bad)).rejects.toMatchObject({ code: 'INVALID_DATA' });
  });

  it('reports CORRUPTED for garbage in storage', async () => {
    const { vault, local } = setupVault();
    await local.set(STORAGE_KEYS.vault, { nope: true });
    await expect(vault.status()).rejects.toMatchObject({ code: 'CORRUPTED' });
  });
});
