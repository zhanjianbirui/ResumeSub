// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverlay } from '@/content/overlay';
import { createAutofillSession, waitForStable } from '@/content/run';
import type { FieldDescriptor, PlanResponse } from '@/shared/autofill-types';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(plan: (fields: FieldDescriptor[]) => PlanResponse) {
  const overlay = createOverlay(document, () => {});
  const requestPlan = vi.fn(async (fields: FieldDescriptor[]) => plan(fields));
  return { overlay, requestPlan, session: createAutofillSession({ doc: document, requestPlan, overlay }) };
}

const fillByLabel = (values: Record<string, string>) => (fields: FieldDescriptor[]): PlanResponse => ({
  status: 'ready',
  fills: fields.filter((f) => values[f.label]).map((f) => ({ signature: f.signature, value: values[f.label] })),
});

describe('autofill session', () => {
  it('fills matched fields, marks the rest and reports counts', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label><label>奇怪<input name="x"></label>';
    const { session, overlay } = setup(fillByLabel({ 姓名: '李明' }));
    await session.run();
    expect((document.querySelector('[name="n"]') as HTMLInputElement).value).toBe('李明');
    expect((document.querySelector('[name="x"]') as HTMLElement).dataset.resumesub).toBe('unfilled');
    expect(overlay.text()).toContain('已填 1');
    expect(overlay.text()).toContain('未填 1');
  });

  it('only sends new fields on later runs and accumulates counts', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    const { session, requestPlan, overlay } = setup(fillByLabel({ 姓名: '李明', 邮箱: 'a@example.com' }));
    await session.run();
    document.body.insertAdjacentHTML('beforeend', '<label>邮箱<input name="e"></label>');
    await session.run();
    expect(requestPlan).toHaveBeenCalledTimes(2);
    expect(requestPlan.mock.calls[1]?.[0].map((f) => f.label)).toEqual(['邮箱']);
    expect(overlay.text()).toContain('已填 2');
    await session.run();
    expect(requestPlan).toHaveBeenCalledTimes(2);
  });

  it('shows the locked message and retries the same fields later', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    let locked = true;
    const { session, overlay } = setup((fields) => (locked ? { status: 'locked' } : fillByLabel({ 姓名: '李明' })(fields)));
    await session.run();
    expect(overlay.text()).toContain('已上锁');
    locked = false;
    await session.run();
    expect((document.querySelector('[name="n"]') as HTMLInputElement).value).toBe('李明');
  });

  it('reports errors from the background without throwing', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    const overlay = createOverlay(document, () => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const session = createAutofillSession({ doc: document, overlay, requestPlan: async () => { throw new Error('boom'); } });
    await session.run();
    expect(overlay.text()).toContain('自动填写失败');
    error.mockRestore();
  });

  it('keeps the overlay out of the page DOM tree', () => {
    const overlay = createOverlay(document, () => {});
    overlay.show({ kind: 'result', filled: 1, unfilled: 0 });
    expect(document.body.textContent).not.toContain('已填');
    overlay.destroy();
    expect(document.getElementById('resumesub-overlay')).toBeNull();
  });
});

describe('waitForStable', () => {
  it('resolves after the DOM stops changing', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    void waitForStable(document.body, 100, 1000).then(done);
    document.body.appendChild(document.createElement('div'));
    await vi.advanceTimersByTimeAsync(50);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
