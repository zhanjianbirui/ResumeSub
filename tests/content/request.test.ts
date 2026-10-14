import { describe, expect, it, vi } from 'vitest';
import { planUrl, requestPlan } from '@/content/request';

describe('requestPlan (C7)', () => {
  it('sends origin + path only, without query or fragment', async () => {
    const send = vi.fn(async () => ({ ok: true, data: { status: 'empty' } }));
    const loc = { origin: 'https://jobs.example.com', pathname: '/apply/1' };
    expect(await requestPlan(send, loc, [])).toEqual({ status: 'empty' });
    expect(send).toHaveBeenCalledWith({ type: 'autofill.plan', url: 'https://jobs.example.com/apply/1', fields: [] });
    expect(planUrl(new URL('https://a.com/x?token=1#y'))).toBe('https://a.com/x');
  });

  it('throws on a missing or failed response', async () => {
    const loc = { origin: 'https://a.com', pathname: '/' };
    await expect(requestPlan(async () => undefined, loc, [])).rejects.toThrow('no response');
    await expect(requestPlan(async () => ({ ok: false, error: { message: 'nope' } }), loc, [])).rejects.toThrow('nope');
  });
});
