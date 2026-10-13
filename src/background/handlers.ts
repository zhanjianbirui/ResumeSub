import type { Request } from '@/shared/messages';
import { emptyVaultData } from '@/shared/schema/vault-data';
import type { AutoLock } from './auto-lock';
import type { PrefsStore } from './prefs';
import type { Vault } from './vault/vault';

export interface HandlerDeps {
  vault: Vault;
  prefs: PrefsStore;
  autoLock: AutoLock;
}

export async function dispatch(req: Request, d: HandlerDeps): Promise<unknown> {
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
    case 'prefs.get':
      return d.prefs.get();
    case 'prefs.save':
      await d.prefs.save(req.prefs);
      await d.autoLock.touch();
      return null;
  }
}
