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
  counts: { education: 0, experience: 0, projects: 0 },
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

describe('session hardening (D1-D4)', () => {
  const input = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;

  it('fills a re-added blank copy of a removed field (D1)', async () => {
    document.body.innerHTML = '<div id="w"><label>姓名<input name="n"></label></div>';
    const { session, requestPlan } = setup(fillByLabel({ 姓名: '李明' }));
    await session.run();
    document.getElementById('w')!.innerHTML = '<label>姓名<input name="n"></label>';
    await session.run();
    expect(requestPlan).toHaveBeenCalledTimes(2);
    expect(input('n').value).toBe('李明');
  });

  it('reports whether fresh fields were sent (D2)', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    const { session } = setup(fillByLabel({ 姓名: '李明' }));
    await expect(session.run()).resolves.toBe(true);
    await expect(session.run()).resolves.toBe(false);
  });

  it('queues exactly one follow-up run when called while busy (D3)', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const overlay = createOverlay(document, () => {});
    const requestPlan = vi.fn(async (fields: FieldDescriptor[]): Promise<PlanResponse> => {
      calls += 1;
      if (calls === 1) {
        await gate;
        return { status: 'locked' };
      }
      return fillByLabel({ 姓名: '李明' })(fields);
    });
    const session = createAutofillSession({ doc: document, requestPlan, overlay });
    const first = session.run();
    await expect(session.run()).resolves.toBe(false);
    await expect(session.run()).resolves.toBe(false);
    release();
    await first;
    expect(requestPlan).toHaveBeenCalledTimes(2);
    expect(input('n').value).toBe('李明');
  });

  it('does not mark unmatched fields that already have a value (D4)', async () => {
    document.body.innerHTML = '<label>奇怪<input name="x" value="预填"></label>';
    const { session, overlay } = setup(fillByLabel({}));
    await session.run();
    expect(input('x').dataset.resumesub).toBeUndefined();
    expect(overlay.text()).toContain('未填 0');
  });

  it('cycles through unfilled fields and drops ones the user filled (D4)', async () => {
    document.body.innerHTML = '<label>甲<input name="a"></label><label>乙<input name="b"></label><label>丙<input name="c"></label>';
    const { session, overlay } = setup(fillByLabel({}));
    await session.run();
    session.nextUnfilled();
    expect(document.activeElement).toBe(input('a'));
    input('b').value = '用户填写';
    session.nextUnfilled();
    expect(document.activeElement).toBe(input('c'));
    expect(input('b').dataset.resumesub).toBeUndefined();
    expect(input('b').style.getPropertyValue('outline')).toBe('');
    expect(overlay.text()).toContain('未填 2');
    session.nextUnfilled();
    expect(document.activeElement).toBe(input('a'));
  });
});

describe('repeatable section expansion', () => {
  const BLOCK = '<div class="edu-item"><label>学校名称<input name="school"></label><label>专业<input name="major"></label></div>';

  it('clicks add once to create a second education block and fills it on the next run', async () => {
    document.body.innerHTML = `<section><h3>教育经历</h3>${BLOCK}<button type="button" id="add">添加教育经历</button></section>`;
    const button = document.getElementById('add') as HTMLButtonElement;
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
      button.insertAdjacentHTML('beforebegin', BLOCK);
    });
    const schools = ['甲大学', '乙大学'];
    const { session } = setup((fields) => ({
      status: 'ready',
      fills: fields.filter((f) => f.label === '学校名称')
        .map((f) => ({ signature: f.signature, value: schools[f.repeatIndex], group: 'education' as const })),
      counts: { education: 2, experience: 0, projects: 0 },
    }));
    await session.run();
    await session.run();
    const values = [...document.querySelectorAll<HTMLInputElement>('[name="school"]')].map((i) => i.value);
    expect(values).toEqual(['甲大学', '乙大学']);
    expect(clicks).toBe(1);
    await session.run();
    expect(clicks).toBe(1);
  });
});
