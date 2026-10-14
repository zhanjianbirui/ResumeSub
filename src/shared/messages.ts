import * as v from 'valibot';
import { AutofillPlanSchema } from './autofill-schema';
import type { PlanResponse } from './autofill-types';
import type { LlmPublicSettings } from './llm-types';
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
  v.object({ type: v.literal('llm.get') }),
  v.object({
    type: v.literal('llm.save'),
    provider: v.picklist(['anthropic', 'openai-compatible']),
    baseUrl: v.pipe(v.string(), v.maxLength(500)),
    model: v.pipe(v.string(), v.maxLength(200)),
    apiKey: v.pipe(v.string(), v.maxLength(500)),
    enabled: v.boolean(),
  }),
  v.object({ type: v.literal('llm.test') }),
  v.object({ type: v.literal('llm.parseResume'), text: v.pipe(v.string(), v.maxLength(100_000)) }),
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
  'llm.get': LlmPublicSettings;
  'llm.save': null;
  'llm.test': { reply: string };
  'llm.parseResume': Profile;
  'profile.get': Profile;
  'profile.save': null;
  'resume.import': null;
  'autofill.plan': PlanResponse;
}

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
