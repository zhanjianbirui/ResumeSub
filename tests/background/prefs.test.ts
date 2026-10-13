import { describe, expect, it } from 'vitest';
import { createPrefs } from '@/background/prefs';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_PREFS } from '@/shared/schema/prefs';
import { memoryArea } from '../helpers/memory-area';

describe('prefs', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await createPrefs(memoryArea()).get()).toEqual(DEFAULT_PREFS);
  });

  it('returns defaults when stored value is invalid', async () => {
    const local = memoryArea();
    await local.set(STORAGE_KEYS.prefs, { autoLockMinutes: 'x' });
    expect(await createPrefs(local).get()).toEqual(DEFAULT_PREFS);
  });

  it('saves and reads back', async () => {
    const prefs = createPrefs(memoryArea());
    await prefs.save({ autoLockMinutes: 15 });
    expect(await prefs.get()).toEqual({ autoLockMinutes: 15 });
  });
});
