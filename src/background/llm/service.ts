import * as v from 'valibot';
import type { LlmLogEntry, LlmPublicSettings, LlmSaveRequest } from '@/shared/llm-types';
import { LLM_ORIGINS_KEY, originPatternOf } from '@/shared/llm-presets';
import type { VaultData } from '@/shared/schema/vault-data';
import type { KVArea } from '../storage';
import type { Vault } from '../vault/vault';
import { assertConfigured, type ChatFn, type LlmConfig, LlmError } from './client';

const LOG_KEY = 'llmLog';
const MAX_LOG = 20;

const LogSchema = v.array(v.object({
  at: v.number(), purpose: v.picklist(['map', 'parse', 'test']), model: v.string(), ok: v.boolean(),
  ms: v.number(), detail: v.optional(v.string()),
}));

export function enabledConfig(data: VaultData): LlmConfig | undefined {
  const llm = data.settings.llm;
  if (!llm || data.settings.offlineMode) return undefined;
  try {
    return assertConfigured(llm);
  } catch {
    return undefined;
  }
}

export function publicSettings(data: VaultData, log: LlmLogEntry[]): LlmPublicSettings {
  const llm = data.settings.llm;
  return {
    provider: llm?.provider ?? 'anthropic',
    baseUrl: llm?.baseUrl ?? '',
    model: llm?.model ?? '',
    hasKey: Boolean(llm?.apiKey),
    keyHint: llm?.apiKey ? `…${llm.apiKey.slice(-4)}` : '',
    enabled: Boolean(llm) && !data.settings.offlineMode,
    log,
  };
}

/** 调用记录只存时间、用途、模型、是否成功和耗时，不存任何发送内容或密钥。 */
export function createLlmLog(local: KVArea, now: () => number = Date.now) {
  async function read(): Promise<LlmLogEntry[]> {
    const parsed = v.safeParse(LogSchema, await local.get(LOG_KEY));
    return parsed.success ? parsed.output : [];
  }
  async function record<T>(purpose: LlmLogEntry['purpose'], model: string, task: () => Promise<T>, detail?: string): Promise<T> {
    const start = now();
    const append = async (ok: boolean, info?: string) => {
      const entry: LlmLogEntry = { at: start, purpose, model, ok, ms: now() - start, ...(info ? { detail: info } : {}) };
      await local.set(LOG_KEY, [entry, ...(await read())].slice(0, MAX_LOG));
    };
    try {
      const result = await task();
      await append(true, detail);
      return result;
    } catch (error) {
      await append(false, error instanceof LlmError ? error.code : 'ERROR');
      throw error;
    }
  }
  return { read, record };
}

export type LlmLog = ReturnType<typeof createLlmLog>;

export async function saveSettings(vault: Vault, local: KVArea, req: LlmSaveRequest): Promise<void> {
  await vault.update((data) => {
    const keep = req.apiKey.trim() === '' ? data.settings.llm?.apiKey ?? '' : req.apiKey.trim();
    const llm = { provider: req.provider, baseUrl: req.baseUrl.trim().replace(/\/+$/, ''), model: req.model.trim(), apiKey: keep };
    return { ...data, settings: { ...data.settings, llm, offlineMode: !req.enabled } };
  });
  const pattern = originPatternOf(req.baseUrl);
  await local.set(LLM_ORIGINS_KEY, pattern ? [pattern] : []);
}

export async function testConnection(cfg: LlmConfig | undefined, chat: ChatFn): Promise<string> {
  const reply = await chat(assertConfigured(cfg), {
    system: '只回复 OK 两个字母。', user: 'ping', effort: 'low', maxTokens: 50,
  });
  return reply.trim().slice(0, 40);
}
