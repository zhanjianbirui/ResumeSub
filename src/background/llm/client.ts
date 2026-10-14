import Anthropic from '@anthropic-ai/sdk';
import type { LlmProtocol } from '@/shared/llm-presets';

export interface LlmConfig {
  provider: LlmProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ChatRequest {
  system: string;
  user: string;
  /** 简单分类任务用 low，抽取类任务用 medium（只对支持 effort 的 Claude 模型生效）。 */
  effort: 'low' | 'medium';
  maxTokens: number;
}

export type LlmErrorCode = 'AUTH' | 'RATE_LIMIT' | 'NOT_FOUND' | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'REFUSED' | 'CONFIG';

const MESSAGES: Record<LlmErrorCode, string> = {
  AUTH: 'API Key 无效或没有权限',
  RATE_LIMIT: '请求太频繁或额度不足，请稍后再试',
  NOT_FOUND: '模型名称或接口地址不正确',
  NETWORK: '无法连接到模型服务，请检查网络或接口地址',
  TIMEOUT: '模型响应超时',
  BAD_RESPONSE: '模型返回的内容无法解析',
  REFUSED: '模型拒绝了这次请求',
  CONFIG: '请先在设置 → AI 模型中填写接口地址、模型和 API Key',
};

export class LlmError extends Error {
  constructor(readonly code: LlmErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}（${detail}）` : MESSAGES[code]);
    this.name = 'LlmError';
  }
}

export const TIMEOUT_MS = 30_000;
/** 支持 effort 与服务端拒答回退（fallbacks: 'default'）的 Claude 型号。 */
const EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable)-5/;
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export function assertConfigured(cfg: LlmConfig | undefined): LlmConfig {
  if (!cfg || !cfg.baseUrl.trim() || !cfg.model.trim() || !cfg.apiKey.trim()) throw new LlmError('CONFIG');
  return cfg;
}

function mapAnthropicError(error: unknown): LlmError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new LlmError('AUTH');
  if (error instanceof Anthropic.RateLimitError) return new LlmError('RATE_LIMIT');
  if (error instanceof Anthropic.NotFoundError) return new LlmError('NOT_FOUND');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('TIMEOUT');
  if (error instanceof Anthropic.APIConnectionError) return new LlmError('NETWORK');
  if (error instanceof Anthropic.APIError) return new LlmError('BAD_RESPONSE', `HTTP ${String(error.status)}`);
  return new LlmError('NETWORK');
}

async function callAnthropic(cfg: LlmConfig, req: ChatRequest): Promise<string> {
  const client = new Anthropic({
    apiKey: cfg.apiKey, baseURL: cfg.baseUrl, dangerouslyAllowBrowser: true, timeout: TIMEOUT_MS, maxRetries: 1,
  });
  const fallback = FALLBACK_MODELS.has(cfg.model);
  try {
    const response = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      ...(EFFORT_MODELS.test(cfg.model) ? { output_config: { effort: req.effort } } : {}),
      // 拒答时由服务端按类别自动换模型重试（opt-in）
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
    if (response.stop_reason === 'refusal') throw new LlmError('REFUSED');
    return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  } catch (error) {
    throw error instanceof LlmError ? error : mapAnthropicError(error);
  }
}

function httpError(status: number): LlmError {
  if (status === 401 || status === 403) return new LlmError('AUTH');
  if (status === 429 || status === 402) return new LlmError('RATE_LIMIT');
  if (status === 404) return new LlmError('NOT_FOUND');
  return new LlmError('BAD_RESPONSE', `HTTP ${status}`);
}

async function callOpenAiCompatible(cfg: LlmConfig, req: ChatRequest, fetchImpl: typeof fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: req.maxTokens,
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      }),
    });
    if (!res.ok) throw httpError(res.status);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError('BAD_RESPONSE');
    return content;
  } catch (error) {
    if (error instanceof LlmError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') throw new LlmError('TIMEOUT');
    throw new LlmError('NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

export type ChatFn = (cfg: LlmConfig, req: ChatRequest) => Promise<string>;

export function createChat(fetchImpl: typeof fetch = (...args) => fetch(...args)): ChatFn {
  return (cfg, req) => (cfg.provider === 'anthropic' ? callAnthropic(cfg, req) : callOpenAiCompatible(cfg, req, fetchImpl));
}

/** 从模型回复中取出 JSON（容忍 ```json 代码块和前后说明文字）。 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (start < 0 || end < start) throw new LlmError('BAD_RESPONSE');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new LlmError('BAD_RESPONSE');
  }
}
