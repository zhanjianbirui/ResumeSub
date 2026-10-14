import * as v from 'valibot';
import { AutofillPlanSchema } from './autofill-schema';
import type { PlanResponse } from './autofill-types';
import { type Profile, ProfileSchema } from './schema/profile';
import { ResumeFileSchema } from './schema/vault-data';

export interface AppStatus {
  /** 存在旧版（主密码加密）的档案，需要清空后重新导入。 */
  legacy: boolean;
  hasProfile: boolean;
  resumeName: string | null;
}

export const RequestSchema = v.variant('type', [
  v.object({ type: v.literal('app.status') }),
  v.object({ type: v.literal('vault.reset') }),
  v.object({ type: v.literal('profile.get') }),
  v.object({ type: v.literal('profile.save'), profile: ProfileSchema }),
  v.object({ type: v.literal('resume.import'), profile: ProfileSchema, file: ResumeFileSchema }),
  AutofillPlanSchema,
]);

export type Request = v.InferOutput<typeof RequestSchema>;
export type RequestType = Request['type'];

export interface ResponseMap {
  'app.status': AppStatus;
  'vault.reset': null;
  'profile.get': Profile;
  'profile.save': null;
  'resume.import': null;
  'autofill.plan': PlanResponse;
}

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
