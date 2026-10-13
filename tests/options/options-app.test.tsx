// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/options/App';
import { firstIssue, ProfileEditor } from '@/entrypoints/options/ProfileEditor';
import { ApiError, call } from '@/shared/client';
import { emptyEducation, emptyProfile } from '@/shared/schema/profile';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));

const mockCall = vi.mocked(call);

function backend(handlers: Record<string, (req: Record<string, unknown>) => unknown>) {
  mockCall.mockImplementation((async (req: { type: string }) => {
    const handler = handlers[req.type];
    if (!handler) throw new Error(`unexpected ${req.type}`);
    return handler(req as Record<string, unknown>);
  }) as never);
}

beforeEach(() => { mockCall.mockReset(); });
afterEach(cleanup);

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
    fireEvent.click(screen.getByText('加密保存'));
    await screen.findByText(/education\.0\.start/);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('options App', () => {
  it('explains how to unlock when the vault is locked', async () => {
    backend({ 'profile.get': () => { throw new ApiError('LOCKED', '数据已上锁，请先解锁'); } });
    render(<App />);
    await screen.findByText(/档案已上锁/);
  });

  it('explains how to start when the vault is not initialized', async () => {
    backend({ 'profile.get': () => { throw new ApiError('NOT_INITIALIZED', '尚未设置主密码'); } });
    render(<App />);
    await screen.findByText(/尚未创建档案/);
  });

  it('loads, edits and saves the profile', async () => {
    const saved: unknown[] = [];
    backend({
      'profile.get': () => emptyProfile(),
      'profile.save': (req) => { saved.push(req.profile); return null; },
      'prefs.get': () => ({ autoLockMinutes: 60 }),
    });
    render(<App />);
    const name = await screen.findByLabelText('姓名');
    fireEvent.input(name, { target: { value: '赵六' } });
    fireEvent.click(screen.getByText('加密保存'));
    await screen.findByText('已加密保存');
    expect(saved).toEqual([{ ...emptyProfile(), basic: { ...emptyProfile().basic, name: '赵六' } }]);
  });

  it('saves auto-lock preference', async () => {
    backend({
      'profile.get': () => emptyProfile(),
      'prefs.get': () => ({ autoLockMinutes: 60 }),
      'prefs.save': () => null,
    });
    render(<App />);
    const select = await screen.findByLabelText('自动上锁');
    fireEvent.change(select, { target: { value: '15' } });
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith({ type: 'prefs.save', prefs: { autoLockMinutes: 15 } }),
    );
  });
});
