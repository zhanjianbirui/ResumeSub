// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/options/App';
import { firstIssue, ProfileEditor } from '@/entrypoints/options/ProfileEditor';
import { call } from '@/shared/client';
import { emptyEducation, emptyProfile } from '@/shared/schema/profile';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));

vi.mock('@/shared/site-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/site-access')>()),
  currentTabOrigin: vi.fn(async () => null),
  listEnabledSites: vi.fn(async () => []),
}));

const mockCall = vi.mocked(call);

function backend(handlers: Record<string, (req: Record<string, unknown>) => unknown>) {
  mockCall.mockImplementation((async (req: { type: string }) => {
    const handler = handlers[req.type];
    if (!handler) throw new Error(`unexpected ${req.type}`);
    return handler(req as Record<string, unknown>);
  }) as never);
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockCall.mockReset();
  location.hash = '';
  consoleError = vi.spyOn(console, 'error');
});
afterEach(() => {
  cleanup();
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

describe('firstIssue', () => {
  it('returns null for a valid profile and a path-prefixed message otherwise', () => {
    expect(firstIssue(emptyProfile())).toBeNull();
    const bad = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    expect(firstIssue(bad)).toMatch(/^education\.0\.start：/);
  });
});

describe('ProfileEditor', () => {
  it('blocks saving invalid data without calling onSave', async () => {
    const onSave = vi.fn();
    const bad = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    render(<ProfileEditor initial={bad} onSave={onSave} />);
    fireEvent.click(screen.getByText('保存档案'));
    await screen.findByText(/education\.0\.start/);
    expect(onSave).not.toHaveBeenCalled();
  });
});

const READY = { legacy: false, hasProfile: true, resumeName: 'cv.pdf' };

describe('options App', () => {
  it('shows the legacy notice and resets after a two-step confirmation', async () => {
    let legacy = true;
    backend({
      'app.status': () => ({ legacy, hasProfile: false, resumeName: null }),
      'profile.get': () => emptyProfile(),
      'vault.reset': () => { legacy = false; return null; },
    });
    render(<App />);
    await screen.findByText(/检测到旧版/);
    fireEvent.click(screen.getByText('数据与隐私'));
    fireEvent.click(await screen.findByText('清空所有数据', { selector: 'button' }));
    expect(mockCall).not.toHaveBeenCalledWith({ type: 'vault.reset' });
    fireEvent.click(screen.getByText('确认清空'));
    await screen.findByText('数据已清空。');
    expect(mockCall).toHaveBeenCalledWith({ type: 'vault.reset' });
    expect(location.hash).toBe('#data');
  });

  it('loads, edits and saves the profile', async () => {
    const saved: unknown[] = [];
    backend({
      'app.status': () => READY,
      'profile.get': () => emptyProfile(),
      'profile.save': (req) => { saved.push(req.profile); return null; },
    });
    render(<App />);
    const name = await screen.findByLabelText('姓名');
    fireEvent.input(name, { target: { value: '赵六' } });
    fireEvent.click(screen.getByText('保存档案'));
    await screen.findByText('已保存');
    expect(saved).toEqual([{ ...emptyProfile(), basic: { ...emptyProfile().basic, name: '赵六' } }]);
  });

  it('clears the saved notice when the user edits', async () => {
    backend({ 'app.status': () => READY, 'profile.get': () => emptyProfile(), 'profile.save': () => null });
    render(<App />);
    const name = await screen.findByLabelText('姓名');
    fireEvent.click(screen.getByText('保存档案'));
    await screen.findByText('已保存');
    fireEvent.input(name, { target: { value: '钱七' } });
    await waitFor(() => expect(screen.queryByText('已保存')).toBeNull());
  });

  it('navigates between tabs via the side nav and the URL hash', async () => {
    backend({ 'app.status': () => READY, 'profile.get': () => emptyProfile() });
    location.hash = '#import';
    render(<App />);
    await screen.findByLabelText('选择简历文件');
    expect(screen.getByText(/当前简历文件：cv\.pdf/)).toBeTruthy();
    fireEvent.click(screen.getByText('自动填写网站'));
    await screen.findByText('一键授权常见招聘网站');
    expect(location.hash).toBe('#sites');
    fireEvent.click(screen.getByText('档案'));
    await screen.findByLabelText('姓名');
  });
});
