export interface PendingTabs {
  add(tabId: number): void;
  flush(): Promise<void>;
}

/** 记录因档案上锁而没能完成填写的标签页，解锁后通知它们重试。标签页已关闭导致的发送失败是正常情况，忽略即可。 */
export function createPendingTabs(notify: (tabId: number) => Promise<unknown>): PendingTabs {
  let waiting: ReadonlySet<number> = new Set();
  return {
    add(tabId) {
      waiting = new Set([...waiting, tabId]);
    },
    async flush() {
      const tabs = [...waiting];
      waiting = new Set();
      await Promise.all(tabs.map((tabId) => notify(tabId).catch(() => undefined)));
    },
  };
}
