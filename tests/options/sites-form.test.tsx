// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const SITE = 'https://jobs.example.com/*';
const alertText = async () => (await screen.findByRole('alert')).textContent;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

it('lists enabled sites, grants presets in one click and removes a site', async () => {
  let enabled = [SITE];
  m.listEnabledSites.mockImplementation(async () => enabled);
  m.enableSites.mockImplementation(async (patterns) => { enabled = [...enabled, ...patterns]; return true; });
  m.disableSites.mockImplementation(async (patterns) => { enabled = enabled.filter((p) => !patterns.includes(p)); return true; });
  render(<SitesForm />);
  await screen.findByText(SITE);
  fireEvent.click(screen.getByText('一键授权常见招聘网站'));
  await waitFor(() => expect(m.enableSites).toHaveBeenCalledWith(PRESET_SITES.map((s) => s.pattern)));
  await screen.findByText(PRESET_SITES[0]!.pattern);
  fireEvent.click(screen.getAllByText('移除')[0]!);
  await waitFor(() => expect(m.disableSites).toHaveBeenCalledWith([SITE]));
});

describe('error paths (F3, F5)', () => {
  it('reports a failed listing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.listEnabledSites.mockRejectedValue(new Error('boom'));
    render(<SitesForm />);
    expect(await alertText()).toBe('读取授权站点失败');
    error.mockRestore();
  });

  it('reports denied and failed grants', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.listEnabledSites.mockResolvedValue([]);
    m.enableSites.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('boom'));
    render(<SitesForm />);
    fireEvent.click(screen.getByText('一键授权常见招聘网站'));
    expect(await alertText()).toBe('未获得授权');
    fireEvent.click(screen.getByText('一键授权常见招聘网站'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('操作失败，请重试'));
    error.mockRestore();
  });

  it('shows 移除失败 when removal is refused or throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.listEnabledSites.mockResolvedValue([SITE]);
    m.disableSites.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('boom'));
    render(<SitesForm />);
    fireEvent.click(await screen.findByText('移除'));
    expect(await alertText()).toBe('移除失败');
    cleanup();
    render(<SitesForm />);
    fireEvent.click(await screen.findByText('移除'));
    expect(await alertText()).toBe('移除失败');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

it('disables all buttons while a request is pending (F2)', async () => {
  m.listEnabledSites.mockResolvedValue([SITE]);
  let finish: (ok: boolean) => void = () => {};
  m.enableSites.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
  render(<SitesForm />);
  const remove = await screen.findByText('移除');
  const grant = screen.getByText('一键授权常见招聘网站');
  fireEvent.click(grant);
  await waitFor(() => expect((grant as HTMLButtonElement).disabled).toBe(true));
  expect((remove as HTMLButtonElement).disabled).toBe(true);
  finish(true);
  await waitFor(() => expect((grant as HTMLButtonElement).disabled).toBe(false));
});
