import * as v from 'valibot';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_PREFS, type Prefs, PrefsSchema } from '@/shared/schema/prefs';
import type { KVArea } from './storage';

export interface PrefsStore {
  get(): Promise<Prefs>;
  save(prefs: Prefs): Promise<void>;
}

export function createPrefs(local: KVArea): PrefsStore {
  return {
    async get() {
      const result = v.safeParse(PrefsSchema, await local.get(STORAGE_KEYS.prefs));
      return result.success ? result.output : DEFAULT_PREFS;
    },
    async save(prefs) {
      await local.set(STORAGE_KEYS.prefs, v.parse(PrefsSchema, prefs));
    },
  };
}
