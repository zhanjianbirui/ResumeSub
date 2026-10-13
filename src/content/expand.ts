import type { EntryGroup, FillInstruction } from '@/shared/autofill-types';
import type { ScannedField } from './scan';
import { findAddButton } from './add-button';

export { findAddButton };

const GROUPS: readonly EntryGroup[] = ['education', 'experience', 'projects'];
export const MAX_EXPAND_CLICKS = 10;

export interface ExpandState {
  clicks: number;
  lastBlocks: Record<EntryGroup, number>;
}

export interface ExpandField {
  group?: EntryGroup;
  repeatIndex: number;
  element: HTMLElement;
}

export interface ExpandPlan {
  group: EntryGroup;
  anchor: HTMLElement;
}

function lastOf(fields: readonly ExpandField[], group: EntryGroup): ExpandField | undefined {
  return fields.reduce<ExpandField | undefined>(
    (best, f) => (f.group === group && (!best || f.repeatIndex >= best.repeatIndex) ? f : best),
    undefined,
  );
}

/**
 * 每个 group 最多产出一次点击：档案条数多于页面区块数、上次点击后区块数确实增加了（或从未点过），
 * 并且总点击数没到上限。
 */
export function planExpansion(
  fields: readonly ExpandField[],
  counts: Record<EntryGroup, number>,
  state: ExpandState,
): ExpandPlan[] {
  return GROUPS.reduce<ExpandPlan[]>((plans, group) => {
    const last = lastOf(fields, group);
    if (!last) return plans;
    const blocks = last.repeatIndex + 1;
    const grew = state.lastBlocks[group] === 0 || blocks > state.lastBlocks[group];
    const underCap = state.clicks + plans.length < MAX_EXPAND_CLICKS;
    return counts[group] > blocks && grew && underCap ? [...plans, { group, anchor: last.element }] : plans;
  }, []);
}

const blocksOf = (fields: readonly ExpandField[], group: EntryGroup) => (lastOf(fields, group)?.repeatIndex ?? -1) + 1;

/** 跨多轮 run 记录已见过的分组字段和点击次数；新区块插入后由重扫调度器接着填写。 */
export function createExpander() {
  let seen: readonly ExpandField[] = [];
  let state: ExpandState = { clicks: 0, lastBlocks: { education: 0, experience: 0, projects: 0 } };

  function afterFill(fields: readonly ScannedField[], fills: readonly FillInstruction[], counts: Record<EntryGroup, number>): number {
    const groups = new Map(fills.filter((f) => f.group).map((f) => [f.signature, f.group]));
    const grouped = fields
      .filter((f) => groups.has(f.descriptor.signature))
      .map((f) => ({ group: groups.get(f.descriptor.signature), repeatIndex: f.descriptor.repeatIndex, element: f.element }));
    seen = [...seen.filter((f) => f.element.isConnected), ...grouped];
    let clicked = 0;
    for (const plan of planExpansion(seen, counts, state)) {
      const button = findAddButton(plan.anchor, plan.group);
      if (!button) continue;
      button.click();
      clicked += 1;
      state = {
        clicks: state.clicks + 1,
        lastBlocks: { ...state.lastBlocks, [plan.group]: blocksOf(seen, plan.group) },
      };
    }
    return clicked;
  }

  return { afterFill };
}
