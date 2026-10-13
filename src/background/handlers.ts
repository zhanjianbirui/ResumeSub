import type { Request } from '@/shared/messages';
import { emptyVaultData } from '@/shared/schema/vault-data';
import type { AutoLock } from './auto-lock';
import { planFills } from './autofill/plan';
import type { PendingTabs } from './pending';
import type { PrefsStore } from './prefs';
import type { Vault } from './vault/vault';

export interface HandlerDeps {
  vault: Vault;
  prefs: PrefsStore;
  autoLock: AutoLock;
  pending: PendingTabs;
}

export interface RequestContext {
  tabId?: number;
}

export async function dispatch(req: Request, d: HandlerDeps, ctx: RequestContext = {}): Promise<unknown> {
  switch (req.type) {
    case 'vault.status':
      return { status: await d.vault.status() };
    case 'vault.setup':
      await d.vault.setup(req.password, emptyVaultData());
      await d.autoLock.touch();
      return null;
    case 'vault.unlock':
      await d.vault.unlock(req.password);
      await d.autoLock.touch();
      // 通知等待中的标签页重试，不阻塞解锁响应
      void d.pending.flush().catch((error: unknown) => console.error('[ResumeSub] pending flush failed', error));
      return null;
    case 'vault.lock':
      await d.vault.lock();
      await d.autoLock.cancel();
      return null;
    case 'profile.get': {
      const data = await d.vault.read();
      await d.autoLock.touch();
      return data.profile;
    }
    case 'profile.save': {
      const data = await d.vault.read();
      await d.vault.write({ ...data, profile: req.profile });
      await d.autoLock.touch();
      return null;
    }
    case 'resume.import': {
      const data = await d.vault.read();
      await d.vault.write({ ...data, profile: req.profile, resumeFile: req.file });
      await d.autoLock.touch();
      return null;
    }
    case 'autofill.plan': {
      if ((await d.vault.status()) !== 'unlocked') {
        if (ctx.tabId !== undefined) await d.pending.add(ctx.tabId);
        return { status: 'locked' };
      }
      // 网页触发的请求不续期自动上锁：否则页面可以让档案一直保持解锁
      const data = await d.vault.read();
      return { status: 'ready', fills: planFills(req.fields, data) };
    }
    case 'prefs.get':
      return d.prefs.get();
    case 'prefs.save':
      await d.prefs.save(req.prefs);
      await d.autoLock.touch();
      return null;
  }
}
