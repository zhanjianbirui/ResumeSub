import { browser } from 'wxt/browser';
import { createOverlay } from '@/content/overlay';
import { requestPlan } from '@/content/request';
import { createAutofillSession, waitForStable } from '@/content/run';
import type { FieldDescriptor } from '@/shared/autofill-types';

const LOADED_FLAG = '__resumesubAutofillLoaded';
const RERUN_DEBOUNCE_MS = 800;
const MAX_RUNS = 20;

const plan = (fields: FieldDescriptor[]) => requestPlan((m) => browser.runtime.sendMessage(m), location, fields);

export default defineContentScript({
  registration: 'runtime',
  async main() {
    const scope = globalThis as Record<string, unknown>;
    if (scope[LOADED_FLAG]) return;
    scope[LOADED_FLAG] = true;

    let session: ReturnType<typeof createAutofillSession> | undefined;
    const overlay = createOverlay(document, () => session?.nextUnfilled());
    session = createAutofillSession({ doc: document, requestPlan: plan, overlay });

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
