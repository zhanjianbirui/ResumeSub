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

function makeRouter(vaultOverride?: Vault) {
  const local = memoryArea();
  const session = memoryArea();
  const vault = vaultOverride ?? createVault({ local, session, now: () => 0, iterations: 1000 });
  const events: string[] = [];
  const autoLock = {
    touch: async () => { events.push('touch'); },
    cancel: async () => { events.push('cancel'); },
  };
  const handle = createRouter({ vault, prefs: createPrefs(local), autoLock, extId: EXT_ID, extOrigin: ORIGIN });
  return { handle, events, vault };
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
