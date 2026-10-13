// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SitesForm } from '@/entrypoints/options/SitesForm';
import * as access from '@/shared/site-access';
import { PRESET_SITES } from '@/shared/sites';

vi.mock('@/shared/site-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/site-access')>()),
  listEnabledSites: vi.fn(),
  enableSites: vi.fn(),
  disableSites: vi.fn(),
}));

const m = vi.mocked(access);

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

it('lists enabled sites, grants presets in one click and removes a site', async () => {
  let enabled = ['https://jobs.example.com/*'];
  m.listEnabledSites.mockImplementation(async () => enabled);
  m.enableSites.mockImplementation(async (patterns) => { enabled = [...enabled, ...patterns]; return true; });
  m.disableSites.mockImplementation(async (patterns) => { enabled = enabled.filter((p) => !patterns.includes(p)); return true; });
  render(<SitesForm />);
  await screen.findByText('https://jobs.example.com/*');
  fireEvent.click(screen.getByText('一键授权常见招聘网站'));
  await waitFor(() => expect(m.enableSites).toHaveBeenCalledWith(PRESET_SITES.map((s) => s.pattern)));
  await screen.findByText(PRESET_SITES[0]!.pattern);
  fireEvent.click(screen.getAllByText('移除')[0]!);
  await waitFor(() => expect(m.disableSites).toHaveBeenCalledWith(['https://jobs.example.com/*']));
});
