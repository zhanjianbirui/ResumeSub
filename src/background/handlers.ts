import type { AppStatus, Request } from '@/shared/messages';
import type { Profile } from '@/shared/schema/profile';
import type { VaultData } from '@/shared/schema/vault-data';
import { entryCounts, planWithFallback } from './autofill/plan';
import { assertConfigured, type ChatFn } from './llm/client';
import { parseResumeWithLlm } from './llm/parse-resume';
import { enabledConfig, type LlmLog, publicSettings, saveSettings, testConnection } from './llm/service';
import type { KVArea } from './storage';
import type { Vault } from './vault/vault';

export interface HandlerDeps {
  vault: Vault;
  /** 大模型相关依赖；测试里可以不传，此时 AI 功能视为未配置。 */
  llm?: { chat: ChatFn; log: LlmLog; local: KVArea };
}

export interface RequestContext {
  /** 发起请求的网页 origin（content script 请求才有）。 */
  origin?: string;
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

async function autofillPlan(req: Extract<Request, { type: 'autofill.plan' }>, d: HandlerDeps, ctx: RequestContext) {
  if ((await d.vault.state()) === 'legacy') return { status: 'empty' };
  const data = await d.vault.read();
  if (!hasProfile(data.profile)) return { status: 'empty' };
  const origin = ctx.origin ?? '';
  const cfg = d.llm ? enabledConfig(data) : undefined;
  const llm = d.llm;
  const chat: ChatFn | undefined = cfg && llm
    ? (c, r) => llm.log.record('map', c.model, () => llm.chat(c, r))
    : undefined;
  const result = await planWithFallback(req.fields, data, {
    memory: data.siteMappings[origin] ?? {},
    llm: cfg && chat ? { cfg, chat } : undefined,
    onLlmError: (error) => console.warn('[ResumeSub] llm field mapping failed', error),
  });
  if (origin && Object.keys(result.learned).length > 0) {
    await d.vault.update((cur: VaultData) => ({
      ...cur,
      siteMappings: { ...cur.siteMappings, [origin]: { ...(cur.siteMappings[origin] ?? {}), ...result.learned } },
    }));
  }
  return { status: 'ready', fills: result.fills, counts: entryCounts(data) };
}

async function llmRequest(req: Extract<Request, { type: `llm.${string}` }>, d: HandlerDeps): Promise<unknown> {
  const llm = d.llm;
  if (!llm) throw new Error('llm deps missing');
  switch (req.type) {
    case 'llm.get':
      return publicSettings(await d.vault.read(), await llm.log.read());
    case 'llm.save':
      await saveSettings(d.vault, llm.local, req);
      return null;
    case 'llm.test': {
      const cfg = assertConfigured((await d.vault.read()).settings.llm);
      return { reply: await llm.log.record('test', cfg.model, () => testConnection(cfg, llm.chat)) };
    }
    case 'llm.parseResume': {
      const cfg = assertConfigured((await d.vault.read()).settings.llm);
      return llm.log.record('parse', cfg.model, () => parseResumeWithLlm(req.text, cfg, llm.chat));
    }
  }
}

export async function dispatch(req: Request, d: HandlerDeps, ctx: RequestContext = {}): Promise<unknown> {
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
    case 'autofill.plan':
      return autofillPlan(req, d, ctx);
    default:
      return llmRequest(req, d);
  }
}
