import type { LlmProtocol } from './llm-presets';

export interface LlmLogEntry {
  at: number;
  purpose: 'map' | 'parse' | 'test';
  model: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

/** 返回给设置页的配置：不包含 API Key 本身，只有末 4 位提示。 */
export interface LlmPublicSettings {
  provider: LlmProtocol;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
  enabled: boolean;
  log: LlmLogEntry[];
}

export interface LlmSaveRequest {
  provider: LlmProtocol;
  baseUrl: string;
  model: string;
  /** 留空表示保留已保存的 Key。 */
  apiKey: string;
  enabled: boolean;
}
