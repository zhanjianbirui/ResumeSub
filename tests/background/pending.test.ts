import { describe, expect, it, vi } from 'vitest';
import { createPendingTabs, PENDING_TABS_KEY } from '@/background/pending';
import { memoryArea } from '../helpers/memory-area';

describe('pending tabs (E1)', () => {
  it('notifies each waiting tab once, ignoring closed tabs', async () => {
    const notify = vi.fn(async (tabId: number) => {
      if (tabId === 2) throw new Error('No tab with id: 2');
    });
    const pending = createPendingTabs(memoryArea(), notify);
    await pending.add(1);
    await pending.add(2);
    await pending.add(1);
    await pending.flush();
    expect(notify.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    await pending.flush();
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('survives a service worker restart via storage.session', async () => {
    const area = memoryArea();
    await createPendingTabs(area, async () => {}).add(5);
    expect(await area.get(PENDING_TABS_KEY)).toEqual([5]);
    const notify = vi.fn(async () => {});
    await createPendingTabs(area, notify).flush();
    expect(notify).toHaveBeenCalledWith(5);
    expect(await area.get(PENDING_TABS_KEY)).toBeUndefined();
  });

  it('keeps concurrent adds and ignores corrupt stored values', async () => {
    const area = memoryArea();
    await area.set(PENDING_TABS_KEY, ['x', 3, -1, 1.5]);
    const pending = createPendingTabs(area, async () => {});
    await Promise.all([pending.add(7), pending.add(8)]);
    expect(await area.get(PENDING_TABS_KEY)).toEqual([3, 7, 8]);
  });
});
