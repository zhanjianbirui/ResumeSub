import { browser } from 'wxt/browser';
import { LLM_ORIGIN_PATTERNS, LLM_ORIGINS_KEY } from './llm-presets';

export const originPattern = (origin: string) => `${origin}/*`;

export async function currentTabOrigin(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    const url = new URL(tab?.url ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

export const isSiteEnabled = (origin: string) => browser.permissions.contains({ origins: [originPattern(origin)] });
export const enableSites = (patterns: string[]) => browser.permissions.request({ origins: patterns });
export const disableSites = (patterns: string[]) => browser.permissions.remove({ origins: patterns });

/** 授权给大模型 API 的地址不是招聘网站，不在站点列表里显示。 */
export async function llmOrigins(): Promise<string[]> {
  const stored = (await browser.storage.local.get(LLM_ORIGINS_KEY))[LLM_ORIGINS_KEY];
  const custom = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
  return [...LLM_ORIGIN_PATTERNS, ...custom];
}

export async function listEnabledSites(): Promise<string[]> {
  const exclude = await llmOrigins().catch(() => [...LLM_ORIGIN_PATTERNS]);
  return ((await browser.permissions.getAll()).origins ?? [])
    .filter((o) => /^https?:\/\//.test(o) && !exclude.includes(o));
}
