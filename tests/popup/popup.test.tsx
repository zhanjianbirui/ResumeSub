// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/popup/App';
import { validateNewPassword } from '@/entrypoints/popup/SetupForm';
import { ApiError, call } from '@/shared/client';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));

const mockCall = vi.mocked(call);
const PW = 'correct-horse-1';

function backend(initial: 'uninitialized' | 'locked' | 'unlocked') {
  let status = initial;
  mockCall.mockImplementation((async (req: { type: string; password?: string }) => {
    if (req.type === 'vault.status') return { status };
    if (req.type === 'vault.setup' || req.type === 'vault.unlock') {
      if (req.password !== PW) throw new ApiError('WRONG_PASSWORD', '主密码错误');
      status = 'unlocked';
      return null;
    }
    if (req.type === 'vault.lock') { status = 'locked'; return null; }
    throw new Error(`unexpected ${req.type}`);
  }) as never);
}

function typeInto(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  mockCall.mockReset();
});
afterEach(cleanup);

describe('validateNewPassword', () => {
  it('checks length and confirmation', () => {
    expect(validateNewPassword('short', 'short')).toContain('至少');
    expect(validateNewPassword(PW, 'different-pw')).toBe('两次输入的密码不一致');
    expect(validateNewPassword(PW, PW)).toBeNull();
  });
});

describe('popup', () => {
  it('creates a vault on first run', async () => {
    backend('uninitialized');
    render(<App />);
    await screen.findByText('创建加密档案');
    typeInto('主密码', PW);
    typeInto('确认主密码', PW);
    fireEvent.click(screen.getByText('创建加密档案'));
    await screen.findByText('✅ 已解锁');
    expect(mockCall).toHaveBeenCalledWith({ type: 'vault.setup', password: PW });
  });

  it('does not call setup when confirmation mismatches', async () => {
    backend('uninitialized');
    render(<App />);
    await screen.findByText('创建加密档案');
    typeInto('主密码', PW);
    typeInto('确认主密码', 'something-else');
    fireEvent.click(screen.getByText('创建加密档案'));
    await screen.findByText('两次输入的密码不一致');
    expect(mockCall).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'vault.setup' }));
  });

  it('shows backend error on wrong password and unlocks on correct one', async () => {
    backend('locked');
    render(<App />);
    await screen.findByText('解锁');
    typeInto('主密码', 'nope-nope-nope');
    fireEvent.click(screen.getByText('解锁'));
    await screen.findByText('主密码错误');
    typeInto('主密码', PW);
    fireEvent.click(screen.getByText('解锁'));
    await screen.findByText('✅ 已解锁');
  });

  it('locks on demand', async () => {
    backend('unlocked');
    render(<App />);
    fireEvent.click(await screen.findByText('立即上锁'));
    await waitFor(() => expect(screen.getByText('解锁')).toBeTruthy());
  });
});
