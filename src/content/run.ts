import type { FieldDescriptor, FillInstruction, PlanResponse } from '@/shared/autofill-types';
import { applyFill, type FillOutcome, hasValue } from './fill';
import { markField } from './mark';
import type { Overlay } from './overlay';
import { type ScannedField, scanFields } from './scan';
import { createUnfilledTracker } from './unfilled';

export interface SessionDeps {
  doc: Document;
  requestPlan(fields: FieldDescriptor[]): Promise<PlanResponse>;
  overlay: Overlay;
}

export function waitForStable(root: Node, quietMs = 500, maxMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer: ReturnType<typeof setTimeout>;
    const finish = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, quietMs);
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true });
    quietTimer = setTimeout(finish, quietMs);
    const maxTimer = setTimeout(finish, maxMs);
  });
}

function outcomeOf(field: ScannedField, fill: FillInstruction | undefined): FillOutcome {
  if (fill) return applyFill(field, fill);
  return hasValue(field.element) ? 'skipped' : 'failed';
}

function applyAll(fields: readonly ScannedField[], fills: readonly FillInstruction[]) {
  const bySignature = new Map(fills.map((f) => [f.signature, f]));
  let filled = 0;
  const unfilled: HTMLElement[] = [];
  for (const field of fields) {
    const outcome = outcomeOf(field, bySignature.get(field.descriptor.signature));
    if (outcome === 'filled') {
      filled += 1;
      markField(field.element, 'filled');
    } else if (outcome === 'failed') {
      unfilled.push(field.element);
      markField(field.element, 'unfilled');
    }
  }
  return { filled, unfilled };
}

/** 串行执行任务：忙时再次调用只排队一次后续执行。返回值表示本次（含排队的后续）是否发送了新字段。 */
function withFollowUp(task: () => Promise<boolean>): () => Promise<boolean> {
  let busy = false;
  let pending = false;
  return async () => {
    if (busy) {
      pending = true;
      return false;
    }
    busy = true;
    let sent = false;
    try {
      do {
        pending = false;
        sent = (await task()) || sent;
      } while (pending);
    } finally {
      busy = false;
    }
    return sent;
  };
}

/**
 * 每次 run 只处理本次新出现的控件（按元素判断，被替换成新节点的字段会重新处理）；
 * 上锁时不记为已处理，解锁后可以重试。忙时再次调用只排队一次后续 run。
 */
export function createAutofillSession(deps: SessionDeps) {
  const handled = new WeakSet<HTMLElement>();
  let filledTotal = 0;
  const unfilled = createUnfilledTracker();

  const showResult = () => deps.overlay.show({ kind: 'result', filled: filledTotal, unfilled: unfilled.count() });

  async function runOnce(): Promise<boolean> {
    try {
      const fresh = scanFields(deps.doc).filter((f) => !handled.has(f.element));
      if (fresh.length === 0) return false;
      const plan = await deps.requestPlan(fresh.map((f) => f.descriptor));
      if (plan.status === 'locked') {
        deps.overlay.show({ kind: 'locked' });
        return true;
      }
      const result = applyAll(fresh, plan.fills);
      fresh.forEach((f) => handled.add(f.element));
      filledTotal += result.filled;
      unfilled.add(result.unfilled);
      showResult();
      return true;
    } catch (error) {
      console.error('[ResumeSub] autofill failed', error);
      deps.overlay.show({ kind: 'error', message: '请刷新页面重试' });
      return false;
    }
  }

  const run = withFollowUp(runOnce);

  function nextUnfilled(): void {
    if (unfilled.next()) showResult();
  }

  return { run, nextUnfilled };
}
