import * as v from 'valibot';
import { RequestSchema, type RequestType, type Response } from '@/shared/messages';
import { dispatch, type HandlerDeps } from './handlers';
import { VaultError } from './vault/errors';

export interface SenderLike {
  id?: string;
  url?: string;
  tab?: unknown;
}

export type SenderKind = 'extension' | 'content' | 'unknown';

export interface RouterDeps extends HandlerDeps {
  extId: string;
  extOrigin: string;
}

/** content script 可调用的接口白名单。M1 为空；M3 加入 scan / fill / suggest。 */
const CONTENT_ALLOWED: ReadonlySet<RequestType> = new Set<RequestType>();

export function classifySender(sender: SenderLike, extId: string, extOrigin: string): SenderKind {
  if (sender.id !== extId) return 'unknown';
  if (sender.url?.startsWith(extOrigin)) return 'extension';
  if (sender.tab) return 'content';
  return 'unknown';
}

const fail = (code: string, message: string): Response<never> => ({ ok: false, error: { code, message } });

function toFailure(error: unknown): Response<never> {
  if (error instanceof VaultError) return fail(error.code, error.message);
  console.error('[ResumeSub] unexpected error', error);
  return fail('INTERNAL', '内部错误，请重试');
}

export function createRouter(deps: RouterDeps) {
  return async function handle(raw: unknown, sender: SenderLike): Promise<Response<unknown>> {
    const kind = classifySender(sender, deps.extId, deps.extOrigin);
    if (kind === 'unknown') return fail('FORBIDDEN', '无权调用该接口');
    const parsed = v.safeParse(RequestSchema, raw);
    if (!parsed.success) return fail('BAD_REQUEST', '请求格式无效');
    const req = parsed.output;
    if (kind === 'content' && !CONTENT_ALLOWED.has(req.type)) return fail('FORBIDDEN', '无权调用该接口');
    try {
      return { ok: true, data: await dispatch(req, deps) };
    } catch (error) {
      return toFailure(error);
    }
  };
}
