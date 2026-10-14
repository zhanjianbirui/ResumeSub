import type { FieldDescriptor, FillInstruction, PlanResponse } from '@/shared/autofill-types';
import { createExpander } from './expand';
import { applyFill, type FillContext, type FillOutcome, hasValue } from './fill';
import { markField } from './mark';
import type { Overlay } from './overlay';
import { type ScannedField, scanFields } from './scan';
import { createUnfilledTracker } from './unfilled';

export interface SessionDeps {
  doc: Document;
  requestPlan(fields: FieldDescriptor[]): Promise<PlanResponse>;
  overlay: Overlay;
  /** 覆盖异步填写器的等待参数（测试里用更短的超时）。 */
  fillContext?: Partial<FillContext>;
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

async function outcomeOf(field: ScannedField, fill: FillInstruction | undefined, ctx: Partial<FillContext>): Promise<FillOutcome> {
  if (fill) return applyFill(field, fill, ctx);
  return hasValue(field.element) ? 'skipped' : 'failed';
}

/** 逐个串行填写：自定义下拉框必须一个一个展开，不能并发。 */
async function applyAll(fields: readonly ScannedField[], fills: readonly FillInstruction[], ctx: Partial<FillContext>) {
  const bySignature = new Map(fills.map((f) => [f.signature, f]));
  let filled = 0;
  let review = 0;
  const unfilled: HTMLElement[] = [];
  for (const field of fields) {
    // 前面的填写可能让页面移除了这个控件（切换区块、重新渲染），这时既不填也不标记。
    if (!field.element.isConnected) continue;
    const fill = bySignature.get(field.descriptor.signature);
    const outcome = await outcomeOf(field, fill, ctx);
    if (outcome === 'filled') {
      filled += 1;
      const inferred = fill?.source === 'llm';
      if (inferred) review += 1;
      markField(field.element, inferred ? 'review' : 'filled');
    } else if (outcome === 'failed') {
      unfilled.push(field.element);
      markField(field.element, 'unfilled');
    }
  }
  return { filled, review, unfilled };
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
  let reviewTotal = 0;
  const unfilled = createUnfilledTracker();
  const expander = createExpander();

  /** 展开失败不影响已经显示的填写结果。 */
  function expandSafely(fresh: readonly ScannedField[], plan: Extract<PlanResponse, { status: 'ready' }>) {
    try {
      expander.afterFill(fresh, plan.fills, plan.counts);
    } catch (error) {
      console.warn('[ResumeSub] expand failed', error);
    }
  }

  const showResult = () => deps.overlay.show({ kind: 'result', filled: filledTotal, review: reviewTotal, unfilled: unfilled.count() });

  async function runOnce(): Promise<boolean> {
    try {
      const fresh = scanFields(deps.doc).filter((f) => !handled.has(f.element));
      if (fresh.length === 0) return false;
      const plan = await deps.requestPlan(fresh.map((f) => f.descriptor));
      if (plan.status === 'empty') {
        deps.overlay.show({ kind: 'empty' });
        return true;
      }
      const result = await applyAll(fresh, plan.fills, deps.fillContext ?? {});
      fresh.forEach((f) => handled.add(f.element));
      filledTotal += result.filled;
      reviewTotal += result.review;
      unfilled.add(result.unfilled);
      showResult();
      expandSafely(fresh, plan);
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
