import * as v from 'valibot';
import { AutofillPlanSchema } from './autofill-schema';
import type { PlanResponse } from './autofill-types';
import { type Profile, ProfileSchema } from './schema/profile';
import { ResumeFileSchema } from './schema/vault-data';
import { type Prefs, PrefsSchema } from './schema/prefs';

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export const RequestSchema = v.variant('type', [
  v.object({ type: v.literal('vault.status') }),
  v.object({ type: v.literal('vault.setup'), password: v.string() }),
  v.object({ type: v.literal('vault.unlock'), password: v.string() }),
  v.object({ type: v.literal('vault.lock') }),
  v.object({ type: v.literal('profile.get') }),
  v.object({ type: v.literal('profile.save'), profile: ProfileSchema }),
  v.object({ type: v.literal('prefs.get') }),
  v.object({ type: v.literal('prefs.save'), prefs: PrefsSchema }),
  v.object({ type: v.literal('resume.import'), profile: ProfileSchema, file: ResumeFileSchema }),
  AutofillPlanSchema,
]);

export type Request = v.InferOutput<typeof RequestSchema>;
export type RequestType = Request['type'];

export interface ResponseMap {
  'vault.status': { status: VaultStatus };
  'vault.setup': null;
  'vault.unlock': null;
  'vault.lock': null;
  'profile.get': Profile;
  'profile.save': null;
  'prefs.get': Prefs;
  'prefs.save': null;
  'resume.import': null;
  'autofill.plan': PlanResponse;
}

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
