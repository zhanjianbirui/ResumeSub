import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { emptyEducation, emptyProfile, ProfileSchema } from '@/shared/schema/profile';
import { emptyVaultData, VaultDataSchema } from '@/shared/schema/vault-data';
import { DEFAULT_PREFS, PrefsSchema } from '@/shared/schema/prefs';

describe('ProfileSchema', () => {
  it('accepts an empty profile', () => {
    expect(v.safeParse(ProfileSchema, emptyProfile()).success).toBe(true);
  });

  it('accepts YYYY-MM, present and empty dates', () => {
    const profile = {
      ...emptyProfile(),
      education: [
        { ...emptyEducation(), start: '2025-09', end: 'present' },
        { ...emptyEducation(), start: '', end: '' },
      ],
    };
    expect(v.safeParse(ProfileSchema, profile).success).toBe(true);
  });

  it('rejects malformed dates with a readable message', () => {
    const profile = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    const result = v.safeParse(ProfileSchema, profile);
    expect(result.success).toBe(false);
    expect(result.issues?.[0].message).toContain('YYYY-MM');
  });

  it('rejects malformed birthDate', () => {
    const profile = { ...emptyProfile(), basic: { ...emptyProfile().basic, birthDate: '2000/01/01' } };
    expect(v.safeParse(ProfileSchema, profile).success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = v.parse(ProfileSchema, { ...emptyProfile(), evil: 1 });
    expect(result).not.toHaveProperty('evil');
  });
});

describe('VaultDataSchema', () => {
  it('accepts empty vault data', () => {
    expect(v.safeParse(VaultDataSchema, emptyVaultData()).success).toBe(true);
  });

  it('rejects wrong version', () => {
    expect(v.safeParse(VaultDataSchema, { ...emptyVaultData(), version: 2 }).success).toBe(false);
  });
});

describe('PrefsSchema', () => {
  it('accepts defaults and rejects unsupported minutes', () => {
    expect(v.safeParse(PrefsSchema, DEFAULT_PREFS).success).toBe(true);
    expect(v.safeParse(PrefsSchema, { autoLockMinutes: 7 }).success).toBe(false);
  });
});
