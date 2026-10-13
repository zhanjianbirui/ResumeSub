// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCrossOriginFrame, startAutofill } from '@/content/start';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function deps(doc: Document = document) {
  const session = { run: vi.fn(async () => true), nextUnfilled: vi.fn() };
  let retry: (() => void) | undefined;
  const onRetry = vi.fn((listener: () => void) => { retry = listener; });
  return { doc, session, onRetry, getUrl: () => 'https://a.example/', fire: () => retry?.() };
}

describe('startAutofill', () => {
  it('registers the retry listener before the page settles (D3)', async () => {
    const d = deps();
    const started = startAutofill(d);
    expect(d.onRetry).toHaveBeenCalledTimes(1);
    d.fire();
    expect(d.session.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    const stop = await started;
    expect(d.session.run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('works on a document without a body (D5)', async () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.remove();
    const d = deps(doc);
    const started = startAutofill(d);
    await vi.advanceTimersByTimeAsync(600);
    const stop = await started;
    expect(d.session.run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('reruns only when form controls are added (D2)', async () => {
    const d = deps();
    const started = startAutofill(d);
    await vi.advanceTimersByTimeAsync(600);
    const stop = await started;
    document.body.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.session.run).toHaveBeenCalledTimes(1);
    document.body.appendChild(document.createElement('input'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.session.run).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('startAutofill rerun budget (R4)', () => {
  it('disconnects the observer once the rerun budget is exhausted', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const d = deps();
    const started = startAutofill(d);
    await vi.advanceTimersByTimeAsync(600);
    const stop = await started;
    disconnect.mockClear(); // waitForStable 自己的观察者在首轮前已断开
    for (let i = 0; i < 19; i += 1) {
      expect(disconnect).not.toHaveBeenCalled();
      document.body.appendChild(document.createElement('input'));
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(d.session.run).toHaveBeenCalledTimes(20);
    expect(disconnect).toHaveBeenCalled();
    document.body.appendChild(document.createElement('input'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.session.run).toHaveBeenCalledTimes(20);
    stop();
    disconnect.mockRestore();
  });
});

describe('isCrossOriginFrame (D6)', () => {
  const win = (top: boolean, origin: string, ancestors?: string[]) => {
    const self = {} as Window;
    return { self, top: top ? self : ({} as Window), location: { origin, ancestorOrigins: ancestors } };
  };
  const check = (w: ReturnType<typeof win>) => isCrossOriginFrame({ isTop: w.top === w.self, location: w.location });

  it('allows the top frame and same-origin frames', () => {
    expect(check(win(true, 'https://a.example'))).toBe(false);
    expect(check(win(false, 'https://a.example', ['https://a.example']))).toBe(false);
    expect(check(win(false, 'https://a.example'))).toBe(false);
  });

  it('rejects frames embedded by another origin', () => {
    expect(check(win(false, 'https://a.example', ['https://evil.example', 'https://a.example']))).toBe(true);
  });
});
