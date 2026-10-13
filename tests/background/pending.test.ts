import { expect, it, vi } from 'vitest';
import { createPendingTabs } from '@/background/pending';

it('notifies each waiting tab once, ignoring closed tabs', async () => {
  const notify = vi.fn(async (tabId: number) => {
    if (tabId === 2) throw new Error('No tab with id: 2');
  });
  const pending = createPendingTabs(notify);
  pending.add(1);
  pending.add(2);
  pending.add(1);
  await pending.flush();
  expect(notify.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  await pending.flush();
  expect(notify).toHaveBeenCalledTimes(2);
});
