/** 两种协议覆盖主流模型：Anthropic 原生接口，以及 OpenAI 兼容的 /chat/completions 接口。 */
export type LlmProtocol = 'anthropic' | 'openai-compatible';

export interface LlmPreset {
  id: string;
  name: string;
  protocol: LlmProtocol;
  baseUrl: string;
  /** 建议的默认模型，用户可以改成该厂商的任意模型。 */
  model: string;
  keyUrl: string;
}

export const LLM_PRESETS: readonly LlmPreset[] = [
  { id: 'anthropic', name: 'Claude（Anthropic）', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', protocol: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Google Gemini', protocol: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', name: 'DeepSeek', protocol: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen', name: '通义千问（阿里云百炼）', protocol: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://bailian.console.aliyun.com/' },
  { id: 'kimi', name: 'Kimi（月之暗面）', protocol: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'zhipu', name: '智谱 GLM', protocol: 'openai-compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'doubao', name: '豆包（火山方舟）', protocol: 'openai-compatible', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', keyUrl: 'https://console.volcengine.com/ark' },
  { id: 'siliconflow', name: '硅基流动', protocol: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'openrouter', name: 'OpenRouter', protocol: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'custom', name: '自定义（OpenAI 兼容）', protocol: 'openai-compatible', baseUrl: '', model: '', keyUrl: '' },
];

export function presetFor(protocol: LlmProtocol, baseUrl: string): LlmPreset {
  const norm = baseUrl.replace(/\/+$/, '');
  return LLM_PRESETS.find((p) => p.protocol === protocol && p.baseUrl === norm)
    ?? (LLM_PRESETS.find((p) => p.id === 'custom') as LlmPreset);
}

/** 模型 API 的 origin 匹配模式；这些不是招聘网站，站点授权列表里要排除。 */
export function originPatternOf(baseUrl: string): string | null {
  try {
    const { origin, protocol } = new URL(baseUrl);
    return protocol === 'https:' || protocol === 'http:' ? `${origin}/*` : null;
  } catch {
    return null;
  }
}

export const LLM_ORIGIN_PATTERNS: readonly string[] = LLM_PRESETS
  .map((p) => originPatternOf(p.baseUrl))
  .filter((p): p is string => p !== null);

/** 存放用户自定义模型地址 origin 的键（明文，不含密钥），供站点列表排除。 */
export const LLM_ORIGINS_KEY = 'llmOrigins';
