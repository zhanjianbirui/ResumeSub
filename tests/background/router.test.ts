import { describe, expect, it, vi } from 'vitest';
import { classifySender, createRouter } from '@/background/router';
import { createVault, type Vault } from '@/background/vault/vault';
import { MAX_RESUME_BASE64, STORAGE_KEYS } from '@/shared/constants';
import { emptyProfile } from '@/shared/schema/profile';
import { memoryArea } from '../helpers/memory-area';

const EXT_ID = 'ext-id';
const ORIGIN = 'chrome-extension://ext-id/';
const page = { id: EXT_ID, url: `${ORIGIN}popup.html` };
const optionsTab = { id: EXT_ID, url: `${ORIGIN}options.html`, tab: { id: 3 } };
const content = { id: EXT_ID, url: 'https://jobs.example.com/apply', tab: { id: 1 } };

function makeRouter(vaultOverride?: Vault, allowed: boolean | ((url: string) => Promise<boolean>) = true) {
  const local = memoryArea();
  const vault = vaultOverride ?? createVault({ local });
  const handle = createRouter({
    vault, extId: EXT_ID, extOrigin: ORIGIN,
    isOriginAllowed: typeof allowed === 'function' ? allowed : async () => allowed,
  });
  return { handle, vault, local };
}

const named = (name: string) => {
  const base = emptyProfile();
  return { ...base, basic: { ...base.basic, name } };
};

const planReq = {
  type: 'autofill.plan',
  url: 'https://jobs.example.com/apply',
  fields: [{ signature: 'a', kind: 'text', label: '姓名', name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0 }],
};

describe('classifySender', () => {
  it('classifies extension pages, content scripts and strangers', () => {
    expect(classifySender(page, EXT_ID, ORIGIN)).toBe('extension');
    expect(classifySender(optionsTab, EXT_ID, ORIGIN)).toBe('extension');
    expect(classifySender(content, EXT_ID, ORIGIN)).toBe('content');
    expect(classifySender({ id: 'other', url: ORIGIN }, EXT_ID, ORIGIN)).toBe('unknown');
    expect(classifySender({ id: EXT_ID }, EXT_ID, ORIGIN)).toBe('unknown');
  });
});

describe('router', () => {
  it('reports app status without any password setup', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'app.status' }, page)).toEqual({
      ok: true, data: { legacy: false, hasProfile: false, resumeName: null },
    });
    await handle({ type: 'profile.save', profile: named('测试用户') }, page);
    expect(await handle({ type: 'app.status' }, page)).toMatchObject({ ok: true, data: { hasProfile: true } });
  });

  it('returns empty plans until a profile exists, then fills', async () => {
    const { handle } = makeRouter();
    expect(await handle(planReq, content)).toEqual({ ok: true, data: { status: 'empty' } });
    await handle({ type: 'profile.save', profile: named('测试用户') }, page);
    expect(await handle(planReq, content)).toEqual({
      ok: true,
      data: { status: 'ready', fills: [{ signature: 'a', value: '测试用户' }], counts: { education: 0, experience: 0, projects: 0 } },
    });
  });

  it('flags legacy password vaults and lets extension pages reset them', async () => {
    const { handle, local } = makeRouter();
    await local.set(STORAGE_KEYS.vault, { v: 1, salt: 's', iterations: 1, check: { iv: '', ct: '' }, data: { iv: '', ct: '' } });
    expect(await handle({ type: 'app.status' }, page)).toMatchObject({ ok: true, data: { legacy: true } });
    expect(await handle(planReq, content)).toEqual({ ok: true, data: { status: 'empty' } });
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: false, error: { code: 'LEGACY' } });
    expect(await handle({ type: 'vault.reset' }, page)).toEqual({ ok: true, data: null });
    expect(await handle({ type: 'app.status' }, page)).toMatchObject({ ok: true, data: { legacy: false } });
  });

  it('forbids plan requests from origins the user has not authorised', async () => {
    const { handle } = makeRouter(undefined, false);
    expect(await handle(planReq, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('checks the content origin from sender.origin before parsing', async () => {
    const seen: string[] = [];
    const { handle } = makeRouter(undefined, async (url) => {
      seen.push(url);
      return url.startsWith('https://jobs.example.com');
    });
    const framed = { ...content, origin: 'https://evil.example.org', url: 'https://jobs.example.com/apply' };
    expect(await handle({ type: 'nope' }, framed)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(seen).toEqual(['https://evil.example.org']);
    expect(await handle({ type: 'nope' }, content)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('forbids content senders without origin or url', async () => {
    const { handle } = makeRouter();
    expect(await handle(planReq, { id: EXT_ID, tab: { id: 1 } })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await handle(planReq, { id: EXT_ID, url: 'not a url', tab: { id: 1 } })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects malformed requests and unknown senders', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'nope' }, page)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await handle({ type: 'nope' }, { id: 'evil' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('forbids content scripts from extension-only APIs (profile, reset, import)', async () => {
    const { handle } = makeRouter();
    for (const req of [{ type: 'profile.get' }, { type: 'vault.reset' }, { type: 'app.status' }]) {
      expect(await handle(req, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });

  it('hides unexpected errors behind INTERNAL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { state: async () => { throw new Error('boom'); } } as unknown as Vault;
    const { handle } = makeRouter(broken);
    expect(await handle({ type: 'app.status' }, page)).toEqual({
      ok: false, error: { code: 'INTERNAL', message: '内部错误，请重试' },
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('imports profile and resume file atomically', async () => {
    const { handle, vault } = makeRouter();
    const file = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(await handle({ type: 'resume.import', profile: named('导入用户'), file }, page)).toEqual({ ok: true, data: null });
    const stored = await vault.read();
    expect(stored.resumeFile).toEqual(file);
    expect(stored.profile.basic.name).toBe('导入用户');
    expect(await handle({ type: 'app.status' }, page)).toMatchObject({ ok: true, data: { resumeName: 'cv.pdf' } });
  });

  it('rejects resume files with unsupported mime or oversize payload', async () => {
    const { handle } = makeRouter();
    const profile = emptyProfile();
    const badMime = { name: 'cv.exe', mime: 'application/x-msdownload', dataBase64: 'AA==' };
    expect(await handle({ type: 'resume.import', profile, file: badMime }, page))
      .toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    const huge = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'A'.repeat(MAX_RESUME_BASE64 + 4) };
    expect(await handle({ type: 'resume.import', profile, file: huge }, page))
      .toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });
});

describe('router: AI model features', () => {
  async function setup(reply = '{"mappings":[{"i":0,"path":"basic.email","confidence":0.95}]}') {
    const local = memoryArea();
    const vault = createVault({ local });
    const chat = vi.fn(async () => reply);
    const { createLlmLog } = await import('@/background/llm/service');
    const handle = createRouter({
      vault, llm: { chat, log: createLlmLog(local, () => 1000), local },
      extId: EXT_ID, extOrigin: ORIGIN, isOriginAllowed: async () => true,
    });
    const base = emptyProfile();
    await handle({ type: 'profile.save', profile: { ...base, basic: { ...base.basic, name: '测试用户', email: 't@example.com' } } }, page);
    return { handle, chat, local, vault };
  }
  const save = { type: 'llm.save', provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1/', model: 'm', apiKey: 'sk-secret-1234', enabled: true };
  const oddField = { ...planReq, fields: [{ ...planReq.fields[0]!, signature: 'x', label: '联络用电子信箱' }] };

  it('never returns the API key, keeps it when saved blank, and records the model origin', async () => {
    const { handle, local, vault } = await setup();
    await handle(save, page);
    const got = await handle({ type: 'llm.get' }, page);
    expect(got).toMatchObject({ ok: true, data: { hasKey: true, keyHint: '…1234', baseUrl: 'https://api.example.com/v1', enabled: true } });
    expect(JSON.stringify(got)).not.toContain('sk-secret');
    await handle({ ...save, apiKey: '' }, page);
    expect((await vault.read()).settings.llm?.apiKey).toBe('sk-secret-1234');
    expect(await local.get('llmOrigins')).toEqual(['https://api.example.com/*']);
  });

  it('forbids content scripts from every llm.* request', async () => {
    const { handle } = await setup();
    for (const req of [{ type: 'llm.get' }, save, { type: 'llm.test' }, { type: 'llm.parseResume', text: 'x' }]) {
      expect(await handle(req, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }
  });

  it('asks the model once per site, then reuses the learned mapping', async () => {
    const { handle, chat } = await setup();
    expect(await handle(oddField, content)).toMatchObject({ ok: true, data: { fills: [] } });
    expect(chat).not.toHaveBeenCalled();
    await handle(save, page);
    expect(await handle(oddField, content)).toMatchObject({ ok: true, data: { fills: [{ signature: 'x', value: 't@example.com', source: 'llm' }] } });
    expect(await handle(oddField, content)).toMatchObject({ ok: true, data: { fills: [{ signature: 'x', value: 't@example.com', source: 'memory' }] } });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(await handle({ type: 'llm.get' }, page)).toMatchObject({ ok: true, data: { log: [{ purpose: 'map', ok: true }] } });
  });

  it('respects the disable switch and reports configuration errors in Chinese', async () => {
    const { handle, chat } = await setup();
    await handle({ ...save, enabled: false }, page);
    await handle(oddField, content);
    expect(chat).not.toHaveBeenCalled();
    const fresh = await setup();
    expect(await fresh.handle({ type: 'llm.test' }, page)).toMatchObject({ ok: false, error: { code: 'LLM_CONFIG' } });
  });
});
