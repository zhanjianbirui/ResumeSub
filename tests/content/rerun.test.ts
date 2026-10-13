// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addsFormControls, createRerunScheduler } from '@/content/rerun';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(sent = true, maxRuns = 20) {
  let url = 'https://a.example/apply';
  const run = vi.fn(async () => sent);
  const scheduler = createRerunScheduler({ run, debounceMs: 800, maxWaitMs: 3000, maxRuns, getUrl: () => url });
  return { run, scheduler, setUrl: (next: string) => { url = next; } };
}

describe('createRerunScheduler (D2)', () => {
  it('debounces bursts into one run', async () => {
    const { run, scheduler } = setup();
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(400);
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(799);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('runs at the max wait even when mutations never stop', async () => {
    const { run, scheduler } = setup();
    for (let t = 0; t < 3000; t += 500) {
      scheduler.notify();
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('only counts runs that sent fresh fields against the budget', async () => {
    const idle = setup(false, 2);
    for (let i = 0; i < 4; i += 1) {
      idle.scheduler.notify();
      await vi.advanceTimersByTimeAsync(800);
    }
    expect(idle.run).toHaveBeenCalledTimes(4);

    const busy = setup(true, 2);
    await busy.scheduler.runNow();
    busy.scheduler.notify();
    await vi.advanceTimersByTimeAsync(800);
    busy.scheduler.notify();
    await vi.advanceTimersByTimeAsync(800);
    expect(busy.run).toHaveBeenCalledTimes(2);
  });

  it('resets the budget when the URL changes', async () => {
    const { run, scheduler, setUrl } = setup(true, 1);
    await scheduler.runNow();
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(800);
    expect(run).toHaveBeenCalledTimes(1);
    setUrl('https://a.example/apply#step2');
    scheduler.notify();
    await vi.advanceTimersByTimeAsync(800);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reports exhaustion once the budget is spent (R4)', async () => {
    const { scheduler } = setup(true, 2);
    expect(scheduler.exhausted()).toBe(false);
    await scheduler.runNow();
    expect(scheduler.exhausted()).toBe(false);
    await scheduler.runNow();
    expect(scheduler.exhausted()).toBe(true);
  });

  it('stop cancels pending runs', async () => {
    const { run, scheduler } = setup();
    scheduler.notify();
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('addsFormControls (D2)', () => {
  const record = (...nodes: Node[]) => ({ addedNodes: nodes }) as unknown as MutationRecord;

  it('detects added controls directly or nested', () => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<p><select></select></p>';
    expect(addsFormControls([record(document.createElement('input'))])).toBe(true);
    expect(addsFormControls([record(wrapper)])).toBe(true);
    expect(addsFormControls([record(document.createElement('textarea'))])).toBe(true);
  });

  it('ignores text, plain elements and removals', () => {
    expect(addsFormControls([record(document.createTextNode('x'), document.createElement('span'))])).toBe(false);
    expect(addsFormControls([record()])).toBe(false);
  });
});
