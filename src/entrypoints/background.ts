import { browser } from 'wxt/browser';
import type { ScriptPublicPath } from 'wxt/utils/inject-script';
import { createAutoLock, isAutoLockAlarm } from '@/background/auto-lock';
import { createPendingTabs } from '@/background/pending';
import { createPrefs } from '@/background/prefs';
import { createRouter } from '@/background/router';
import { createOriginCheck, injectIntoTabs, syncAutofillScripts } from '@/background/sites';
import { fromBrowserArea } from '@/background/storage';
import { createVault } from '@/background/vault/vault';

export default defineBackground(() => {
  // 显式声明：session 区只允许扩展自身页面访问，content script 不可读
  void browser.storage.session
    .setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' })
    ?.catch((e: unknown) => console.error('[ResumeSub] setAccessLevel failed', e));

  const local = fromBrowserArea(browser.storage.local);
  const session = fromBrowserArea(browser.storage.session);
  const vault = createVault({ local, session, now: Date.now });
  const prefs = createPrefs(local);
  const autoLock = createAutoLock(
    {
      create: (name, info) => browser.alarms.create(name, info),
      clear: (name) => browser.alarms.clear(name),
    },
    async () => (await prefs.get()).autoLockMinutes,
  );
  const extOrigin = browser.runtime.getURL('/');
  const pending = createPendingTabs((tabId) => browser.tabs.sendMessage(tabId, { type: 'autofill.retry' }));
  const isOriginAllowed = createOriginCheck(browser.permissions);
  const handle = createRouter({
    vault, prefs, autoLock, pending, extId: browser.runtime.id, extOrigin,
    isOriginAllowed,
  });

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
  const sync = () =>
    syncAutofillScripts(scripting, browser.permissions).catch((e: unknown) =>
      console.error('[ResumeSub] sync autofill scripts failed', e));
  browser.runtime.onInstalled.addListener(() => void sync());
  browser.runtime.onStartup.addListener(() => void sync());
  browser.permissions.onAdded.addListener((added) => {
    void sync().then(() => injectIntoTabs(browser.tabs, scripting, (added.origins ?? []).filter((o) => /^https?:/.test(o))));
  });
  browser.permissions.onRemoved.addListener(() => void sync());

  browser.alarms.onAlarm.addListener((alarm) => {
    if (isAutoLockAlarm(alarm)) void vault.lock();
  });
});
