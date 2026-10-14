import { browser } from 'wxt/browser';
import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import { createChat } from '@/background/llm/client';
import { createLlmLog } from '@/background/llm/service';
import { createRouter } from '@/background/router';
import { LLM_ORIGIN_PATTERNS, LLM_ORIGINS_KEY } from '@/shared/llm-presets';
import { createOriginCheck, createSyncQueue, injectIntoTabs, syncAutofillScripts } from '@/background/sites';
import { fromBrowserArea } from '@/background/storage';
import { createVault } from '@/background/vault/vault';

export default defineBackground(() => {
  const local = fromBrowserArea(browser.storage.local);
  const vault = createVault({ local });
  const llm = { chat: createChat(), log: createLlmLog(local), local };
  const extOrigin = browser.runtime.getURL('/');
  const isOriginAllowed = createOriginCheck(browser.permissions);
  const handle = createRouter({ vault, llm, extId: browser.runtime.id, extOrigin, isOriginAllowed });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message, sender).then(sendResponse, (error: unknown) => {
      console.error('[ResumeSub] handler crashed', error);
      sendResponse({ ok: false, error: { code: 'INTERNAL', message: '内部错误，请重试' } });
    });
    return true;
  });

  const scripting = {
    getRegisteredContentScripts: (filter: { ids: string[] }) => browser.scripting.getRegisteredContentScripts(filter),
    registerContentScripts: (scripts: Parameters<typeof browser.scripting.registerContentScripts>[0]) =>
      browser.scripting.registerContentScripts(scripts),
    updateContentScripts: (scripts: Parameters<typeof browser.scripting.updateContentScripts>[0]) =>
      browser.scripting.updateContentScripts(scripts),
    unregisterContentScripts: (filter: { ids: string[] }) => browser.scripting.unregisterContentScripts(filter),
    executeScript: (injection: { target: { tabId: number; allFrames: boolean }; files: string[] }) =>
      browser.scripting.executeScript({ target: injection.target, files: injection.files as ScriptPublicPath[] }),
  };
  const queue = createSyncQueue();
  const excluded = async () => {
    const stored = await local.get(LLM_ORIGINS_KEY);
    return [...LLM_ORIGIN_PATTERNS, ...(Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [])];
  };
  const sync = () =>
    queue(async () => syncAutofillScripts(scripting, browser.permissions, await excluded())).catch((e: unknown) =>
      console.error('[ResumeSub] sync autofill scripts failed', e));
  browser.runtime.onInstalled.addListener(() => void sync());
  browser.runtime.onStartup.addListener(() => void sync());
  browser.permissions.onAdded.addListener((added) => {
    void sync().then(async () => {
      const skip = await excluded();
      const sites = (added.origins ?? []).filter((o) => /^https?:/.test(o) && !skip.includes(o));
      if (sites.length > 0) await injectIntoTabs(browser.tabs, scripting, sites);
    });
  });
  browser.permissions.onRemoved.addListener(() => void sync());
});
