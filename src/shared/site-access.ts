import { browser } from 'wxt/browser';

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

export async function listEnabledSites(): Promise<string[]> {
  return ((await browser.permissions.getAll()).origins ?? []).filter((o) => /^https?:\/\//.test(o));
}
