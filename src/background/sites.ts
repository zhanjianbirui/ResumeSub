export const AUTOFILL_SCRIPT_ID = 'resumesub-autofill';
export const AUTOFILL_SCRIPT_FILE = 'content-scripts/autofill.js';

interface PermissionsLike {
  getAll(): Promise<{ origins?: string[] }>;
  contains(permissions: { origins: string[] }): Promise<boolean>;
}

interface ContentScriptSpec {
  id: string;
  js: string[];
  matches: string[];
  runAt: 'document_idle';
  allFrames: boolean;
  persistAcrossSessions: boolean;
}

interface ScriptingLike {
  getRegisteredContentScripts(filter: { ids: string[] }): Promise<{ id: string }[]>;
  registerContentScripts(scripts: ContentScriptSpec[]): Promise<void>;
  updateContentScripts(scripts: ContentScriptSpec[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  executeScript(injection: { target: { tabId: number; allFrames: boolean }; files: string[] }): Promise<unknown>;
}

interface TabsLike {
  query(query: { url: string[] }): Promise<{ id?: number }[]>;
}

const SITE_PATTERN = /^https?:\/\//;

export async function grantedSites(permissions: PermissionsLike): Promise<string[]> {
  return ((await permissions.getAll()).origins ?? []).filter((o) => SITE_PATTERN.test(o));
}

/** 授权的站点列表以 chrome.permissions 为准；每次权限变化后同步 content script 的注册。 */
export async function syncAutofillScripts(scripting: ScriptingLike, permissions: PermissionsLike): Promise<void> {
  const matches = await grantedSites(permissions);
  const registered = await scripting.getRegisteredContentScripts({ ids: [AUTOFILL_SCRIPT_ID] });
  if (matches.length === 0) {
    if (registered.length > 0) await scripting.unregisterContentScripts({ ids: [AUTOFILL_SCRIPT_ID] });
    return;
  }
  const spec: ContentScriptSpec = {
    id: AUTOFILL_SCRIPT_ID, js: [AUTOFILL_SCRIPT_FILE], matches, runAt: 'document_idle', allFrames: true, persistAcrossSessions: true,
  };
  if (registered.length > 0) await scripting.updateContentScripts([spec]);
  else await scripting.registerContentScripts([spec]);
}

/** 刚授权的站点已经打开的页面不会自动注入脚本，这里补一次注入。 */
export async function injectIntoTabs(tabs: TabsLike, scripting: ScriptingLike, patterns: string[]): Promise<void> {
  const open = await tabs.query({ url: patterns });
  await Promise.all(open.map(async ({ id }) => {
    if (id === undefined) return;
    try {
      await scripting.executeScript({ target: { tabId: id, allFrames: true }, files: [AUTOFILL_SCRIPT_FILE] });
    } catch (error) {
      console.warn('[ResumeSub] inject into tab failed', id, error);
    }
  }));
}

export function createOriginCheck(permissions: PermissionsLike): (url: string) => Promise<boolean> {
  return async (url) => {
    try {
      const { origin, protocol } = new URL(url);
      if (protocol !== 'https:' && protocol !== 'http:') return false;
      return await permissions.contains({ origins: [`${origin}/*`] });
    } catch {
      return false;
    }
  };
}
