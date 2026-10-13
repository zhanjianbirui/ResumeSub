import type { EntryGroup, FillInstruction } from '@/shared/autofill-types';
import type { ScannedField } from './scan';
import { repeatBlockOf } from './repeat';
import { clean } from './text';
import { isVisible, layoutAvailable } from './visibility';

const ADD = /添加|新增|增加|\badd\b|^\+/i;
const NOT_ADD = /删除|移除|remove|delete|附件|attachment|上传|upload|保存|提交|下一步|submit|next/i;
const CLICKABLE = 'button, a, [role="button"], [class*="add"]';
/** 没有识别出重复区块时，从字段往上找的层数（Ant Form.List：字段到按钮所在容器约 7-9 层）。 */
const MAX_DEPTH = 12;
/** 识别出重复区块时，只在区块的父级及以上 4 层里找。 */
const BLOCK_LEVELS = 4;
const MAX_ADD_TEXT = 20;
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

function looksLikeAdd(el: HTMLElement, layout: boolean): boolean {
  if ((el as HTMLButtonElement).disabled || !isVisible(el, layout)) return false;
  const text = clean(el.textContent);
  return text.length > 0 && text.length <= MAX_ADD_TEXT && ADD.test(text) && !NOT_ADD.test(text);
}

/**
 * 找"添加"类按钮（排除删除、上传、提交、下一步）：先定位 anchor 所在的重复区块，从区块的父级往上找；
 * 页面上只有一个区块时从 anchor 往上找。每层取第一个可见的候选。
 */
export function findAddButton(anchor: HTMLElement, _group?: EntryGroup): HTMLElement | null {
  const layout = layoutAvailable(anchor.ownerDocument);
  const block = repeatBlockOf(anchor);
  const limit = block ? BLOCK_LEVELS : MAX_DEPTH;
  let node: HTMLElement | null = (block ?? anchor).parentElement;
  for (let depth = 0; node && depth < limit; depth++, node = node.parentElement) {
    const hit = [...node.querySelectorAll<HTMLElement>(CLICKABLE)].find((el) => looksLikeAdd(el, layout));
    if (hit) return hit;
  }
  return null;
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
