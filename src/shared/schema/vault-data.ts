import * as v from 'valibot';
import { MAX_RESUME_BASE64, RESUME_MIMES } from '../constants';
import { emptyProfile, ProfileSchema } from './profile';

export const AnswerSchema = v.object({
  id: v.string(),
  question: v.string(),
  answer: v.string(),
  lang: v.picklist(['zh', 'en']),
  tags: v.array(v.string()),
});

export const ResumeFileSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(255)),
  mime: v.picklist([RESUME_MIMES.pdf, RESUME_MIMES.docx]),
  dataBase64: v.pipe(v.string(), v.maxLength(MAX_RESUME_BASE64)),
});

export type ResumeFile = v.InferOutput<typeof ResumeFileSchema>;

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
