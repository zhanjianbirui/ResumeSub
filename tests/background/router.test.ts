import { describe, expect, it, vi } from 'vitest';
import { createPrefs } from '@/background/prefs';
import { classifySender, createRouter } from '@/background/router';
import { createVault, type Vault } from '@/background/vault/vault';
import { MAX_RESUME_BASE64 } from '@/shared/constants';
import { emptyProfile } from '@/shared/schema/profile';
import { memoryArea } from '../helpers/memory-area';

const EXT_ID = 'ext-id';
const ORIGIN = 'chrome-extension://ext-id/';
const page = { id: EXT_ID, url: `${ORIGIN}popup.html` };
const optionsTab = { id: EXT_ID, url: `${ORIGIN}options.html`, tab: { id: 3 } };
const content = { id: EXT_ID, url: 'https://jobs.example.com/apply', tab: { id: 1 } };
const PW = 'correct-horse-1';

function makeRouter(vaultOverride?: Vault, allowed: boolean | ((url: string) => Promise<boolean>) = true) {
  const local = memoryArea();
  const session = memoryArea();
  const vault = vaultOverride ?? createVault({ local, session, now: () => 0, iterations: 1000 });
  const events: string[] = [];
  const autoLock = {
    touch: async () => { events.push('touch'); },
    cancel: async () => { events.push('cancel'); },
  };
  const pending = {
    added: [] as number[],
    flushed: 0,
    flushWith: (): Promise<void> => Promise.resolve(),
    async add(tabId: number) { this.added.push(tabId); },
    flush() {
      this.flushed += 1;
      return this.flushWith();
    },
  };
  const handle = createRouter({
    vault, prefs: createPrefs(local), autoLock, pending, extId: EXT_ID, extOrigin: ORIGIN,
    isOriginAllowed: typeof allowed === 'function' ? allowed : async () => allowed,
  });
  return { handle, events, vault, pending };
}

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
  const planReq = {
    type: 'autofill.plan',
    url: 'https://jobs.example.com/apply',
    fields: [{ signature: 'a', kind: 'text', label: '姓名', name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0 }],
  };

  it('lets content scripts on allowed origins request a plan', async () => {
    const { handle } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    const base = emptyProfile();
    await handle({ type: 'profile.save', profile: { ...base, basic: { ...base.basic, name: '测试用户' } } }, page);
    expect(await handle(planReq, content)).toEqual({
      ok: true, data: { status: 'ready', fills: [{ signature: 'a', value: '测试用户' }] },
    });
  });

  it('returns locked and remembers the tab, then flushes on unlock', async () => {
    const { handle, pending } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    await handle({ type: 'vault.lock' }, page);
    expect(await handle(planReq, content)).toEqual({ ok: true, data: { status: 'locked' } });
    expect(pending.added).toEqual([1]);
    await handle({ type: 'vault.unlock', password: PW }, page);
    expect(pending.flushed).toBe(1);
  });

  it('forbids plan requests from origins the user has not authorised', async () => {
    const { handle } = makeRouter(undefined, false);
    expect(await handle(planReq, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('does not block unlock on flushing pending tabs and logs flush failures (E1)', async () => {
    const { handle, pending } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    await handle({ type: 'vault.lock' }, page);
    pending.flushWith = () => new Promise<void>(() => {});
    expect(await handle({ type: 'vault.unlock', password: PW }, page)).toEqual({ ok: true, data: null });
    await handle({ type: 'vault.lock' }, page);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    pending.flushWith = () => Promise.reject(new Error('storage gone'));
    expect(await handle({ type: 'vault.unlock', password: PW }, page)).toEqual({ ok: true, data: null });
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('does not extend the auto-lock timer on plan requests (E2)', async () => {
    const { handle, events } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    events.length = 0;
    expect(await handle(planReq, content)).toMatchObject({ ok: true });
    expect(events).not.toContain('touch');
  });

  it('checks the content origin from sender.origin before parsing (E4)', async () => {
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

  it('forbids content senders without origin or url (E4)', async () => {
    const { handle } = makeRouter();
    expect(await handle(planReq, { id: EXT_ID, tab: { id: 1 } })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await handle(planReq, { id: EXT_ID, url: 'not a url', tab: { id: 1 } })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('rejects malformed requests', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'nope' }, page)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('rejects unknown senders with FORBIDDEN before parsing', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'nope' }, { id: 'evil' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('forbids content scripts and unknown senders from extension-only APIs', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'profile.get' }, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await handle({ type: 'vault.status' }, { id: 'evil' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('runs the full setup → save → lock → unlock flow', async () => {
    const { handle, events } = makeRouter();
    expect(await handle({ type: 'vault.status' }, page)).toEqual({ ok: true, data: { status: 'uninitialized' } });
    expect(await handle({ type: 'vault.setup', password: PW }, page)).toEqual({ ok: true, data: null });

    const base = emptyProfile();
    const profile = { ...base, basic: { ...base.basic, name: '测试用户' } };
    expect(await handle({ type: 'profile.save', profile }, page)).toEqual({ ok: true, data: null });

    expect(await handle({ type: 'vault.lock' }, page)).toEqual({ ok: true, data: null });
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: false, error: { code: 'LOCKED' } });

    await handle({ type: 'vault.unlock', password: PW }, page);
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: true, data: { basic: { name: '测试用户' } } });
    expect(events).toContain('touch');
    expect(events).toContain('cancel');
  });

  it('saves and reads prefs', async () => {
    const { handle } = makeRouter();
    await handle({ type: 'prefs.save', prefs: { autoLockMinutes: 15 } }, page);
    expect(await handle({ type: 'prefs.get' }, page)).toEqual({ ok: true, data: { autoLockMinutes: 15 } });
  });

  it('hides unexpected errors behind INTERNAL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { status: async () => { throw new Error('boom'); } } as unknown as Vault;
    const { handle } = makeRouter(broken);
    expect(await handle({ type: 'vault.status' }, page)).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '内部错误，请重试' },
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('imports profile and resume file atomically', async () => {
    const { handle, vault } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    const base = emptyProfile();
    const profile = { ...base, basic: { ...base.basic, name: '导入用户' } };
    const file = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(await handle({ type: 'resume.import', profile, file }, page)).toEqual({ ok: true, data: null });
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: true, data: { basic: { name: '导入用户' } } });
    const stored = await vault.read();
    expect(stored.resumeFile).toEqual(file);
    expect(stored.profile.basic.name).toBe('导入用户');
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
