import type { FieldDescriptor, FillInstruction, PlanResponse } from '@/shared/autofill-types';
import { applyFill } from './fill';
import { markField } from './mark';
import type { Overlay } from './overlay';
import { type ScannedField, scanFields } from './scan';

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

function applyAll(fields: readonly ScannedField[], fills: readonly FillInstruction[], doc: Document) {
  const bySignature = new Map(fills.map((f) => [f.signature, f]));
  let filled = 0;
  const unfilled: HTMLElement[] = [];
  for (const field of fields) {
    const fill = bySignature.get(field.descriptor.signature);
    const outcome = fill ? applyFill(field, fill, doc) : 'failed';
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

/** 每次 run 只处理本次新出现的字段（按 signature 判断）；上锁时不把字段记为已处理，解锁后可以重试。 */
export function createAutofillSession(deps: SessionDeps) {
  let handled: ReadonlySet<string> = new Set();
  let filledTotal = 0;
  let unfilled: readonly HTMLElement[] = [];
  let busy = false;

  async function run(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const fresh = scanFields(deps.doc).filter((f) => !handled.has(f.descriptor.signature));
      if (fresh.length === 0) return;
      const plan = await deps.requestPlan(fresh.map((f) => f.descriptor));
      if (plan.status === 'locked') {
        deps.overlay.show({ kind: 'locked' });
        return;
      }
      const result = applyAll(fresh, plan.fills, deps.doc);
      handled = new Set([...handled, ...fresh.map((f) => f.descriptor.signature)]);
      filledTotal += result.filled;
      unfilled = [...unfilled.filter((el) => el.isConnected), ...result.unfilled];
      deps.overlay.show({ kind: 'result', filled: filledTotal, unfilled: unfilled.length });
    } catch (error) {
      console.error('[ResumeSub] autofill failed', error);
      deps.overlay.show({ kind: 'error', message: '请刷新页面重试' });
    } finally {
      busy = false;
    }
  }

  function nextUnfilled(): void {
    const target = unfilled.find((el) => el.isConnected && el.dataset.resumesub === 'unfilled');
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target?.focus();
  }

  return { run, nextUnfilled };
}
