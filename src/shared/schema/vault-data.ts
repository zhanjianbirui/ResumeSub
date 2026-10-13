import * as v from 'valibot';
import { emptyProfile, ProfileSchema } from './profile';

export const AnswerSchema = v.object({
  id: v.string(),
  question: v.string(),
  answer: v.string(),
  lang: v.picklist(['zh', 'en']),
  tags: v.array(v.string()),
});

export const ResumeFileSchema = v.object({ name: v.string(), mime: v.string(), dataBase64: v.string() });

export const LlmSettingsSchema = v.object({
  provider: v.picklist(['anthropic', 'openai-compatible']),
  baseUrl: v.string(),
  model: v.string(),
  apiKey: v.string(),
});

export const SettingsSchema = v.object({
  llm: v.optional(LlmSettingsSchema),
  offlineMode: v.boolean(),
});

export const VaultDataSchema = v.object({
  version: v.literal(1),
  profile: ProfileSchema,
  answers: v.array(AnswerSchema),
  siteMappings: v.record(v.string(), v.record(v.string(), v.string())),
  resumeFile: v.optional(ResumeFileSchema),
  settings: SettingsSchema,
});

export type VaultData = v.InferOutput<typeof VaultDataSchema>;

export function emptyVaultData(): VaultData {
  return {
    version: 1,
    profile: emptyProfile(),
    answers: [],
    siteMappings: {},
    settings: { offlineMode: false },
  };
}
