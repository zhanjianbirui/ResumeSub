// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/popup/App';
import { ApiError, call } from '@/shared/client';
import { openOptions } from '@/shared/nav';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));
vi.mock('@/shared/nav', () => ({ openOptions: vi.fn() }));
vi.mock('@/shared/site-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/site-access')>()),
  currentTabOrigin: vi.fn(async () => null),
}));

const mockCall = vi.mocked(call);
const mockOpen = vi.mocked(openOptions);

function status(data: unknown) {
  mockCall.mockImplementation((async () => data) as never);
}

beforeEach(() => {
  mockCall.mockReset();
  mockOpen.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('popup', () => {
  it('guides first-time users to import a résumé (no password needed)', async () => {
    status({ legacy: false, hasProfile: false, resumeName: null });
    render(<App />);
    fireEvent.click(await screen.findByText('导入简历开始使用'));
    expect(mockOpen).toHaveBeenCalledWith('import');
    expect(screen.queryByText(/密码/)).toBeNull();
  });

  it('shows a ready profile with the résumé name and quick links', async () => {
    status({ legacy: false, hasProfile: true, resumeName: 'cv.pdf' });
    render(<App />);
    await screen.findByText('档案已就绪');
    expect(screen.getByText('cv.pdf')).toBeTruthy();
    fireEvent.click(screen.getByText('网站管理'));
    expect(mockOpen).toHaveBeenCalledWith('sites');
    fireEvent.click(screen.getByText('编辑档案'));
    expect(mockOpen).toHaveBeenCalledWith('profile');
  });

  it('sends legacy users to the data page', async () => {
    status({ legacy: true, hasProfile: false, resumeName: null });
    render(<App />);
    fireEvent.click(await screen.findByText('前往处理'));
    expect(mockOpen).toHaveBeenCalledWith('data');
  });

  it('shows backend errors', async () => {
    mockCall.mockImplementation((async () => { throw new ApiError('CORRUPTED', '档案数据已损坏'); }) as never);
    render(<App />);
    await screen.findByText('档案数据已损坏');
  });
});
