import type { AppStatus, Request } from '@/shared/messages';
import type { Profile } from '@/shared/schema/profile';
import { entryCounts, planFills } from './autofill/plan';
import type { Vault } from './vault/vault';

export interface HandlerDeps {
  vault: Vault;
}

/** 档案里至少有姓名、联系方式或任一经历，才算"已有档案"。 */
export function hasProfile(profile: Profile): boolean {
  const { name, email, phone } = profile.basic;
  return [name, email, phone].some((v) => v.trim() !== '')
    || profile.education.length > 0 || profile.experience.length > 0;
}

async function appStatus(vault: Vault): Promise<AppStatus> {
  if ((await vault.state()) === 'legacy') return { legacy: true, hasProfile: false, resumeName: null };
  const data = await vault.read();
  return { legacy: false, hasProfile: hasProfile(data.profile), resumeName: data.resumeFile?.name ?? null };
}

export async function dispatch(req: Request, d: HandlerDeps): Promise<unknown> {
  switch (req.type) {
    case 'app.status':
      return appStatus(d.vault);
    case 'vault.reset':
      await d.vault.reset();
      return null;
    case 'profile.get':
      return (await d.vault.read()).profile;
    case 'profile.save':
      await d.vault.update((data) => ({ ...data, profile: req.profile }));
      return null;
    case 'resume.import':
      await d.vault.update((data) => ({ ...data, profile: req.profile, resumeFile: req.file }));
      return null;
    case 'autofill.plan': {
      if ((await d.vault.state()) === 'legacy') return { status: 'empty' };
      const data = await d.vault.read();
      if (!hasProfile(data.profile)) return { status: 'empty' };
      return { status: 'ready', fills: planFills(req.fields, data), counts: entryCounts(data) };
    }
  }
}
