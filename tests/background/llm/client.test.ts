import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const real = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic {
    static AuthenticationError = real.default.AuthenticationError;
    static PermissionDeniedError = real.default.PermissionDeniedError;
    static RateLimitError = real.default.RateLimitError;
    static NotFoundError = real.default.NotFoundError;
    static APIConnectionTimeoutError = real.default.APIConnectionTimeoutError;
    static APIConnectionError = real.default.APIConnectionError;
    static APIError = real.default.APIError;
    beta = { messages: { create } };
    constructor(readonly opts: unknown) {}
  }
  return { default: FakeAnthropic };
});

const { assertConfigured, createChat, extractJson } = await import('@/background/llm/client');

const req = { system: 's', user: 'u', effort: 'low' as const, maxTokens: 100 };
const openai = { provider: 'openai-compatible' as const, baseUrl: 'https://api.example.com/v1/', model: 'm', apiKey: 'k' };

afterEach(() => {
  create.mockReset();
});

describe('extractJson', () => {
  it('reads plain, fenced and wrapped JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('结果如下：\n```json\n{"a":[1]}\n```')).toEqual({ a: [1] });
    expect(extractJson('sure! {"b":2} done')).toEqual({ b: 2 });
  });

  it('rejects non-JSON', () => {
    expect(() => extractJson('no json here')).toThrow(expect.objectContaining({ code: 'BAD_RESPONSE' }));
  });
});

describe('assertConfigured', () => {
  it('requires url, model and key', () => {
    expect(() => assertConfigured(undefined)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    expect(() => assertConfigured({ ...openai, apiKey: ' ' })).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    expect(assertConfigured(openai)).toBe(openai);
  });
});

describe('OpenAI-compatible protocol', () => {
  it('posts chat completions with a bearer key and returns the message', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 }));
    const chat = createChat(fetchImpl as unknown as typeof fetch);
    expect(await chat(openai, req)).toBe('OK');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'm', messages: [{ role: 'system' }, { role: 'user' }] });
  });

  it.each([[401, 'AUTH'], [429, 'RATE_LIMIT'], [404, 'NOT_FOUND'], [500, 'BAD_RESPONSE']])('maps HTTP %i to %s', async (status, code) => {
    const chat = createChat((async () => new Response('x', { status })) as unknown as typeof fetch);
    await expect(chat(openai, req)).rejects.toMatchObject({ code });
  });

  it('maps network failures and malformed bodies', async () => {
    await expect(createChat((async () => { throw new TypeError('fail'); }) as unknown as typeof fetch)(openai, req))
      .rejects.toMatchObject({ code: 'NETWORK' });
    await expect(createChat((async () => new Response('{}', { status: 200 })) as unknown as typeof fetch)(openai, req))
      .rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});

describe('Anthropic protocol (official SDK)', () => {
  const claude = { provider: 'anthropic' as const, baseUrl: 'https://api.anthropic.com', model: 'claude-opus-5-5', apiKey: 'k' };

  it('sends effort and opts into server-side refusal fallbacks on supported models', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] });
    expect(await createChat()(claude, req)).toBe('OK');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-opus-5-5', output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      messages: [{ role: 'user', content: 'u' }], system: 's',
    }));
  });

  it('omits fallbacks for models without server-side fallback and reports refusals', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(createChat()({ ...claude, model: 'claude-haiku-5-5' }, req)).rejects.toMatchObject({ code: 'REFUSED' });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('fallbacks');
  });
});
