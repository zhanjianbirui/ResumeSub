import { browser } from 'wxt/browser';
import { createAutoLock, isAutoLockAlarm } from '@/background/auto-lock';
import { createPrefs } from '@/background/prefs';
import { createRouter } from '@/background/router';
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
  const handle = createRouter({ vault, prefs, autoLock, extId: browser.runtime.id, extOrigin });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message, sender).then(sendResponse, (error: unknown) => {
      console.error('[ResumeSub] handler crashed', error);
      sendResponse({ ok: false, error: { code: 'INTERNAL', message: '内部错误，请重试' } });
    });
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (isAutoLockAlarm(alarm)) void vault.lock();
  });
});
