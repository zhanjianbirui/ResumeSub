import { browser } from 'wxt/browser';
import { createOverlay } from '@/content/overlay';
import { createAutofillSession, waitForStable } from '@/content/run';
import type { FieldDescriptor, PlanResponse } from '@/shared/autofill-types';

const LOADED_FLAG = '__resumesubAutofillLoaded';
const RERUN_DEBOUNCE_MS = 800;
const MAX_RUNS = 20;

async function requestPlan(fields: FieldDescriptor[]): Promise<PlanResponse> {
  const res = (await browser.runtime.sendMessage({ type: 'autofill.plan', url: location.href, fields })) as
    | { ok: true; data: PlanResponse }
    | { ok: false; error: { message: string } }
    | undefined;
  if (!res) throw new Error('no response');
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}

export default defineContentScript({
  registration: 'runtime',
  async main() {
    const scope = globalThis as Record<string, unknown>;
    if (scope[LOADED_FLAG]) return;
    scope[LOADED_FLAG] = true;

    let session: ReturnType<typeof createAutofillSession> | undefined;
    const overlay = createOverlay(document, () => session?.nextUnfilled());
    session = createAutofillSession({ doc: document, requestPlan, overlay });

    await waitForStable(document.body);
    await session.run();

    let runs = 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        runs += 1;
        if (runs > MAX_RUNS) observer.disconnect();
        else void session?.run();
      }, RERUN_DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    browser.runtime.onMessage.addListener((message: unknown) => {
      if ((message as { type?: string } | null)?.type === 'autofill.retry') void session?.run();
    });
  },
});
