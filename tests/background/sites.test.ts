import { describe, expect, it, vi } from 'vitest';
import {
  AUTOFILL_SCRIPT_FILE, AUTOFILL_SCRIPT_ID, createOriginCheck, grantedSites, injectIntoTabs, syncAutofillScripts,
} from '@/background/sites';

function fakeScripting(registered: string[] = []) {
  return {
    getRegisteredContentScripts: vi.fn(async () => registered.map((id) => ({ id }))),
    registerContentScripts: vi.fn(async () => {}),
    updateContentScripts: vi.fn(async () => {}),
    unregisterContentScripts: vi.fn(async () => {}),
    executeScript: vi.fn(async () => []),
  };
}

const perms = (origins: string[]) => ({
  getAll: async () => ({ origins }),
  contains: vi.fn(async ({ origins: [o] }: { origins: string[] }) => origins.some((p) => o?.startsWith(p.replace('/*', '')))),
});

describe('sites', () => {
  it('only treats http(s) patterns as sites', async () => {
    expect(await grantedSites(perms(['https://a.com/*', 'chrome://x/*']))).toEqual(['https://a.com/*']);
  });

  it('registers the script for granted sites', async () => {
    const scripting = fakeScripting();
    await syncAutofillScripts(scripting, perms(['https://jobs.example.com/*']));
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({
      id: AUTOFILL_SCRIPT_ID, js: [AUTOFILL_SCRIPT_FILE], matches: ['https://jobs.example.com/*'], allFrames: true,
    })]);
  });

  it('updates when already registered and unregisters when nothing is granted', async () => {
    const scripting = fakeScripting([AUTOFILL_SCRIPT_ID]);
    await syncAutofillScripts(scripting, perms(['https://a.com/*']));
    expect(scripting.updateContentScripts).toHaveBeenCalled();
    await syncAutofillScripts(scripting, perms([]));
    expect(scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [AUTOFILL_SCRIPT_ID] });
  });

  it('injects into already-open matching tabs and survives failures', async () => {
    const scripting = fakeScripting();
    scripting.executeScript.mockRejectedValueOnce(new Error('cannot access'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tabs = { query: vi.fn(async () => [{ id: 7 }, { id: 8 }, {}]) };
    await injectIntoTabs(tabs, scripting, ['https://a.com/*']);
    expect(tabs.query).toHaveBeenCalledWith({ url: ['https://a.com/*'] });
    expect(scripting.executeScript).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('origin check uses permissions.contains and rejects bad urls', async () => {
    const check = createOriginCheck(perms(['https://jobs.example.com/*']));
    expect(await check('https://jobs.example.com/apply?x=1')).toBe(true);
    expect(await check('https://evil.example.org/')).toBe(false);
    expect(await check('not a url')).toBe(false);
    expect(await check('chrome://settings')).toBe(false);
  });
});
