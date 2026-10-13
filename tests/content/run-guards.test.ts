// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverlay } from '@/content/overlay';
import { createAutofillSession } from '@/content/run';
import type { FieldDescriptor, PlanResponse } from '@/shared/autofill-types';

vi.mock('@/content/expand', () => ({
  createExpander: () => ({
    afterFill: () => {
      throw new Error('expand broke');
    },
  }),
}));

afterEach(() => {
  document.body.innerHTML = '';
});

const plan = (values: Record<string, string>) => async (fields: FieldDescriptor[]): Promise<PlanResponse> => ({
  status: 'ready',
  fills: fields.filter((f) => values[f.label]).map((f) => ({ signature: f.signature, value: values[f.label] })),
  counts: { education: 0, experience: 0, projects: 0 },
});

describe('session guards', () => {
  it('shows the result even when expansion throws', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label>';
    const overlay = createOverlay(document, () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = createAutofillSession({ doc: document, overlay, requestPlan: plan({ 姓名: '李明' }) });
    expect(await session.run()).toBe(true);
    expect(overlay.text()).toContain('已填 1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips fields removed from the page by an earlier fill', async () => {
    document.body.innerHTML = '<label>姓名<input name="n"></label><div id="extra"><label>邮箱<input name="e"></label></div>';
    const name = document.querySelector('[name="n"]') as HTMLInputElement;
    const email = document.querySelector('[name="e"]') as HTMLInputElement;
    name.addEventListener('change', () => document.getElementById('extra')?.remove());
    const overlay = createOverlay(document, () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = createAutofillSession({ doc: document, overlay, requestPlan: plan({ 姓名: '李明' }) });
    await session.run();
    expect(email.dataset.resumesub).toBeUndefined();
    expect(overlay.text()).toContain('未填 0');
    warn.mockRestore();
  });
});
