import { hasValue } from './fill';
import { unmarkField } from './mark';

export interface UnfilledTracker {
  /** 追加本轮未填的控件，同时丢弃已从页面移除的旧控件。 */
  add(elements: readonly HTMLElement[]): void;
  count(): number;
  /** 聚焦下一个仍未填的控件；用户已填或已移除的控件会被移出列表并去掉标记。返回列表是否变化。 */
  next(): boolean;
}

const isPending = (el: HTMLElement) => el.isConnected && el.dataset.resumesub === 'unfilled' && !hasValue(el);

export function createUnfilledTracker(): UnfilledTracker {
  let items: readonly HTMLElement[] = [];
  let lastFocused: HTMLElement | undefined;

  function next(): boolean {
    const start = lastFocused ? items.indexOf(lastFocused) + 1 : 0;
    const target = [...items.slice(start), ...items.slice(0, start)].find(isPending);
    const kept = items.filter(isPending);
    items.filter((el) => !kept.includes(el) && el.isConnected).forEach(unmarkField);
    const changed = kept.length !== items.length;
    items = kept;
    lastFocused = target;
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target?.focus();
    return changed;
  }

  return {
    add(elements) {
      items = [...items.filter((el) => el.isConnected), ...elements];
    },
    count: () => items.length,
    next,
  };
}
