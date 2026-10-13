// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteToggle } from '@/entrypoints/popup/SiteToggle';
import * as access from '@/shared/site-access';

vi.mock('@/shared/site-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/site-access')>()),
  currentTabOrigin: vi.fn(),
  isSiteEnabled: vi.fn(),
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

describe('SiteToggle', () => {
  it('enables autofill for the current site', async () => {
    m.currentTabOrigin.mockResolvedValue('https://jobs.example.com');
    m.isSiteEnabled.mockResolvedValue(false);
    m.enableSites.mockResolvedValue(true);
    render(<SiteToggle />);
    fireEvent.click(await screen.findByText('在此网站启用自动填写'));
    expect(m.enableSites).toHaveBeenCalledWith(['https://jobs.example.com/*']);
    await screen.findByText('在此网站停用');
    expect(screen.getByText(/jobs\.example\.com/)).toBeTruthy();
  });

  it('disables when already enabled', async () => {
    m.currentTabOrigin.mockResolvedValue('https://jobs.example.com');
    m.isSiteEnabled.mockResolvedValue(true);
    m.disableSites.mockResolvedValue(true);
    render(<SiteToggle />);
    fireEvent.click(await screen.findByText('在此网站停用'));
    await screen.findByText('在此网站启用自动填写');
  });

  it('explains unsupported pages', async () => {
    m.currentTabOrigin.mockResolvedValue(null);
    render(<SiteToggle />);
    await screen.findByText('当前页面不支持自动填写');
  });
});
