import type { KVArea } from './storage';

export const PENDING_TABS_KEY = 'pendingTabs';

export interface PendingTabs {
  add(tabId: number): Promise<void>;
  flush(): Promise<void>;
}

const isTabId = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

async function readTabs(area: KVArea): Promise<number[]> {
  const stored = await area.get(PENDING_TABS_KEY);
  return Array.isArray(stored) ? stored.filter(isTabId) : [];
}

/**
 * 记录因档案上锁而没能完成填写的标签页，解锁后通知它们重试。
 * 存在 storage.session 里：MV3 service worker 随时可能被回收，内存状态会丢。
 * 读改写操作串行执行，避免并发 add 互相覆盖。标签页已关闭导致的发送失败是正常情况，忽略即可。
 */
export function createPendingTabs(area: KVArea, notify: (tabId: number) => Promise<unknown>): PendingTabs {
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  };
  return {
    add: (tabId) => serial(async () => {
      const tabs = await readTabs(area);
      if (!tabs.includes(tabId)) await area.set(PENDING_TABS_KEY, [...tabs, tabId]);
    }),
    flush: async () => {
      const tabs = await serial(async () => {
        const waiting = await readTabs(area);
        await area.remove(PENDING_TABS_KEY);
        return waiting;
      });
      await Promise.all(tabs.map((tabId) => notify(tabId).catch(() => undefined)));
    },
  };
}
