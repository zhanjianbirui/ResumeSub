export interface RerunOptions {
  /** 执行一次自动填写，返回是否向后台发送了新字段。 */
  run(): Promise<boolean>;
  debounceMs: number;
  maxWaitMs: number;
  /** 同一 URL 下最多计入预算的 run 次数（只统计真正发送了新字段的 run）。 */
  maxRuns: number;
  getUrl(): string;
  /** 预算在本次 run 后耗尽时调用（只调用一次，直到 URL 变化重置预算）。 */
  onExhausted?(): void;
}

export interface RerunScheduler {
  notify(): void;
  runNow(): Promise<void>;
  stop(): void;
  /** 当前 URL 下的重扫预算是否已用完。 */
  exhausted(): boolean;
}

const CONTROL_SELECTOR = 'input, select, textarea';

/** 只有新增了表单控件（或包含控件的节点）的变动才值得重扫。 */
export function addsFormControls(records: readonly MutationRecord[]): boolean {
  return records.some((record) => Array.from(record.addedNodes).some((node) =>
    node instanceof Element && (node.matches(CONTROL_SELECTOR) || node.querySelector(CONTROL_SELECTOR) !== null)));
}

/** 防抖 + 最长等待的重扫调度；URL 变化（SPA 换页）时重置预算。 */
export function createRerunScheduler(options: RerunOptions): RerunScheduler {
  let runs = 0;
  let url = options.getUrl();
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;

  const clearTimers = () => {
    clearTimeout(debounceTimer);
    clearTimeout(maxTimer);
    debounceTimer = undefined;
    maxTimer = undefined;
  };

  const refreshBudget = () => {
    const current = options.getUrl();
    if (current !== url) {
      url = current;
      runs = 0;
    }
    return runs < options.maxRuns;
  };

  async function runNow(): Promise<void> {
    clearTimers();
    if (!refreshBudget()) return;
    if (!(await options.run())) return;
    runs += 1;
    if (runs >= options.maxRuns) options.onExhausted?.();
  }

  const fire = () => void runNow();

  function notify(): void {
    if (!refreshBudget()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, options.debounceMs);
    maxTimer ??= setTimeout(fire, options.maxWaitMs);
  }

  return { notify, runNow, stop: clearTimers, exhausted: () => runs >= options.maxRuns };
}
