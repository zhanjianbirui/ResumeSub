// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSettings } from '@/entrypoints/options/AiSettings';
import { ApiError, call } from '@/shared/client';
import { enableSites } from '@/shared/site-access';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));
vi.mock('@/shared/site-access', () => ({ enableSites: vi.fn(async () => true) }));

const mockCall = vi.mocked(call);
const EMPTY = { provider: 'anthropic', baseUrl: '', model: '', hasKey: false, keyHint: '', enabled: false, log: [] };

function backend(settings: Record<string, unknown> = EMPTY, extra: Record<string, () => unknown> = {}) {
  mockCall.mockImplementation((async (req: { type: string }) => {
    if (req.type === 'llm.get') return settings;
    if (req.type === 'llm.save') return null;
    const handler = extra[req.type];
    if (handler) return handler();
    throw new Error(`unexpected ${req.type}`);
  }) as never);
}

beforeEach(() => {
  mockCall.mockReset();
  vi.mocked(enableSites).mockClear();
});
afterEach(() => {
  cleanup();
});

describe('AiSettings', () => {
  it('fills URL and model from a preset and saves after granting the API origin', async () => {
    backend();
    render(<AiSettings />);
    const provider = await screen.findByLabelText('服务商');
    fireEvent.change(provider, { target: { value: 'deepseek' } });
    expect((screen.getByLabelText('接口地址') as HTMLInputElement).value).toBe('https://api.deepseek.com/v1');
    expect((screen.getByLabelText('模型名称') as HTMLInputElement).value).toBe('deepseek-chat');
    fireEvent.input(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });
    fireEvent.click(screen.getByText('保存'));
    await screen.findByText('已保存');
    expect(enableSites).toHaveBeenCalledWith(['https://api.deepseek.com/*']);
    expect(mockCall).toHaveBeenCalledWith(expect.objectContaining({
      type: 'llm.save', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', apiKey: 'sk-test',
    }));
  });

  it('shows the masked key, tests the connection and lists calls', async () => {
    backend(
      { ...EMPTY, provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hasKey: true, keyHint: '…abcd', enabled: true,
        log: [{ at: 1, purpose: 'map', model: 'deepseek-chat', ok: true, ms: 800 }] },
      { 'llm.test': () => ({ reply: 'OK' }) },
    );
    render(<AiSettings />);
    expect((await screen.findByLabelText('API Key')).getAttribute('placeholder')).toContain('…abcd');
    expect(screen.getByText('识别字段', { selector: 'span' })).toBeTruthy();
    fireEvent.click(screen.getByText('测试连接'));
    await screen.findByText('连接成功，模型回复：OK');
  });

  it('reports a denied permission and backend errors', async () => {
    backend(EMPTY, { 'llm.test': () => { throw new ApiError('LLM_AUTH', 'API Key 无效或没有权限'); } });
    vi.mocked(enableSites).mockResolvedValueOnce(false);
    render(<AiSettings />);
    fireEvent.click(await screen.findByText('保存'));
    await screen.findByText('需要允许访问模型接口地址才能调用');
    await waitFor(() => expect(mockCall).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'llm.save' })));
  });
});
