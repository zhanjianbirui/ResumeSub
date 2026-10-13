import type { KVArea } from '@/background/storage';

/** 模拟 chrome.storage：读写都做结构化克隆，与真实存储的序列化语义一致。 */
export function memoryArea(): KVArea {
  let store: Readonly<Record<string, unknown>> = {};
  return {
    get: async (key) => structuredClone(store[key]),
    set: async (key, value) => {
      store = { ...store, [key]: structuredClone(value) };
    },
    remove: async (key) => {
      const { [key]: _removed, ...rest } = store;
      store = rest;
    },
  };
}
