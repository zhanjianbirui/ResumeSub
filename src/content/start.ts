import { addsFormControls, createRerunScheduler } from './rerun';
import { waitForStable } from './run';

const RERUN_DEBOUNCE_MS = 800;
const RERUN_MAX_WAIT_MS = 3000;
const MAX_RUNS = 20;

interface FrameInfo {
  isTop: boolean;
  location: { origin: string; ancestorOrigins?: ArrayLike<string> };
}

/** 被其他源嵌入的 iframe 不做任何事（避免第三方页面借嵌入读取或填写）。 */
export function isCrossOriginFrame(frame: FrameInfo): boolean {
  if (frame.isTop) return false;
  const ancestors = frame.location.ancestorOrigins;
  return ancestors !== undefined && Array.from(ancestors).some((origin) => origin !== frame.location.origin);
}

export interface StartDeps {
  doc: Document;
  session: { run(): Promise<boolean> };
  getUrl(): string;
}

/** 等待页面稳定后首轮填写，之后在新增控件时按预算重扫。返回停止函数。 */
export async function startAutofill(deps: StartDeps): Promise<() => void> {
  const root = deps.doc.body ?? deps.doc.documentElement;
  const observer = new MutationObserver((records) => {
    if (addsFormControls(records)) scheduler.notify();
  });
  const scheduler = createRerunScheduler({
    run: () => deps.session.run(),
    debounceMs: RERUN_DEBOUNCE_MS,
    maxWaitMs: RERUN_MAX_WAIT_MS,
    maxRuns: MAX_RUNS,
    getUrl: deps.getUrl,
    // 预算用完后不再需要监听 DOM 变动。
    onExhausted: () => observer.disconnect(),
  });
  await waitForStable(root);
  // 首轮之前就开始监听：首轮里点击"添加"插入的新区块也要触发重扫。
  observer.observe(root, { childList: true, subtree: true });
  await scheduler.runNow();
  return () => {
    observer.disconnect();
    scheduler.stop();
  };
}
