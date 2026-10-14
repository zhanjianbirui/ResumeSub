import { browser } from 'wxt/browser';
import { createOverlay } from '@/content/overlay';
import { requestPlan } from '@/content/request';
import { createAutofillSession } from '@/content/run';
import { isCrossOriginFrame, startAutofill } from '@/content/start';
import type { FieldDescriptor } from '@/shared/autofill-types';

const LOADED_FLAG = '__resumesubAutofillLoaded';

const plan = (fields: FieldDescriptor[]) => requestPlan((m) => browser.runtime.sendMessage(m), location, fields);

export default defineContentScript({
  registration: 'runtime',
  async main() {
    if (isCrossOriginFrame({ isTop: window.top === window, location })) return;
    const scope = globalThis as Record<string, unknown>;
    if (scope[LOADED_FLAG]) return;
    scope[LOADED_FLAG] = true;

    let session: ReturnType<typeof createAutofillSession> | undefined;
    const overlay = createOverlay(document, () => session?.nextUnfilled());
    session = createAutofillSession({ doc: document, requestPlan: plan, overlay });
    await startAutofill({ doc: document, session, getUrl: () => location.href });
  },
});
