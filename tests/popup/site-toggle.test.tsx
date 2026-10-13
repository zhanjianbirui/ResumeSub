// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteToggle } from '@/entrypoints/popup/SiteToggle';
import * as access from '@/shared/site-access';

vi.mock('@/shared/site-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/site-access')>()),
  currentTabOrigin: vi.fn(),
  isSiteEnabled: vi.fn(),
  listEnabledSites: vi.fn(),
  enableSites: vi.fn(),
  disableSites: vi.fn(),
}));

const m = vi.mocked(access);
const ORIGIN = 'https://jobs.example.com';

function site(enabled: boolean, granted: string[] = enabled ? [`${ORIGIN}/*`] : []) {
  m.currentTabOrigin.mockResolvedValue(ORIGIN);
  m.isSiteEnabled.mockResolvedValue(enabled);
  m.listEnabledSites.mockResolvedValue(granted);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('SiteToggle', () => {
  it('enables autofill for the current site', async () => {
    site(false);
    m.enableSites.mockResolvedValue(true);
    render(<SiteToggle />);
    fireEvent.click(await screen.findByText('在此网站启用自动填写'));
    expect(m.enableSites).toHaveBeenCalledWith(['https://jobs.example.com/*']);
    await screen.findByText('在此网站停用');
    expect(screen.getByText(/jobs\.example\.com/)).toBeTruthy();
  });

  it('disables when already enabled and says so without a refresh hint (F4)', async () => {
    site(true);
    m.disableSites.mockResolvedValue(true);
    render(<SiteToggle />);
    expect(await screen.findByText(/已启用自动填写/)).toBeTruthy();
    expect(screen.queryByText(/刷新/)).toBeNull();
    fireEvent.click(screen.getByText('在此网站停用'));
    await screen.findByText('在此网站启用自动填写');
  });

  it('explains preset coverage and offers no per-site disable (F4)', async () => {
    site(true, ['https://*.example.com/*']);
    render(<SiteToggle />);
    await screen.findByText(/已通过常见网站授权启用，可在设置中管理/);
    expect(screen.queryByText('在此网站停用')).toBeNull();
  });

  it('explains unsupported pages', async () => {
    m.currentTabOrigin.mockResolvedValue(null);
    render(<SiteToggle />);
    await screen.findByText('当前页面不支持自动填写');
  });

  it('falls back to unsupported when reading the site state fails (F5)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    m.currentTabOrigin.mockRejectedValue(new Error('no tabs'));
    render(<SiteToggle />);
    await screen.findByText('当前页面不支持自动填写');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('reports a denied grant and a failed request (F5)', async () => {
    site(false);
    m.enableSites.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('boom'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SiteToggle />);
    fireEvent.click(await screen.findByText('在此网站启用自动填写'));
    expect((await screen.findByRole('alert')).textContent).toBe('未获得授权');
    fireEvent.click(screen.getByText('在此网站启用自动填写'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('操作失败，请重试'));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('reports a failed disable (F5)', async () => {
    site(true);
    m.disableSites.mockResolvedValue(false);
    render(<SiteToggle />);
    fireEvent.click(await screen.findByText('在此网站停用'));
    expect((await screen.findByRole('alert')).textContent).toBe('停用失败');
    expect(screen.getByText('在此网站停用')).toBeTruthy();
  });

  it('disables the button while the request is pending (F2)', async () => {
    site(false);
    let finish: (ok: boolean) => void = () => {};
    m.enableSites.mockReturnValue(new Promise<boolean>((resolve) => { finish = resolve; }));
    render(<SiteToggle />);
    const button = await screen.findByText('在此网站启用自动填写');
    fireEvent.click(button);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(button);
    expect(m.enableSites).toHaveBeenCalledTimes(1);
    finish(true);
    const off = await screen.findByText('在此网站停用');
    expect((off as HTMLButtonElement).disabled).toBe(false);
  });
});
