import * as v from 'valibot';
import { RequestSchema, type RequestType, type Response } from '@/shared/messages';
import { dispatch, type HandlerDeps } from './handlers';
import { VaultError } from './vault/errors';

export interface SenderLike {
  id?: string;
  /** 发送消息的 frame 的 origin（Chrome 提供；比 url 更可靠）。 */
  origin?: string;
  url?: string;
  tab?: { id?: number };
}

export type SenderKind = 'extension' | 'content' | 'unknown';

export interface RouterDeps extends HandlerDeps {
  extId: string;
  extOrigin: string;
  isOriginAllowed(url: string): Promise<boolean>;
}

/** content script 可调用的接口白名单：只有 autofill.plan，且发送页面的 origin 必须已获用户授权。 */
const CONTENT_ALLOWED: ReadonlySet<RequestType> = new Set<RequestType>(['autofill.plan']);

export function classifySender(sender: SenderLike, extId: string, extOrigin: string): SenderKind {
  if (sender.id !== extId) return 'unknown';
  if (sender.url?.startsWith(extOrigin)) return 'extension';
  if (sender.tab) return 'content';
  return 'unknown';
}

const fail = (code: string, message: string): Response<never> => ({ ok: false, error: { code, message } });
const forbidden = () => fail('FORBIDDEN', '无权调用该接口');

/** content 发送方的 origin：优先 sender.origin，否则从 sender.url 推出；都没有或无法解析时返回 null。 */
export function senderOrigin(sender: SenderLike): string | null {
  if (sender.origin) return sender.origin;
  if (!sender.url) return null;
  try {
    return new URL(sender.url).origin;
  } catch {
    return null;
  }
}

async function contentOriginAllowed(sender: SenderLike, deps: RouterDeps): Promise<boolean> {
  const origin = senderOrigin(sender);
  return origin !== null && origin !== 'null' && (await deps.isOriginAllowed(origin));
}

function toFailure(error: unknown): Response<never> {
  if (error instanceof VaultError) return fail(error.code, error.message);
  console.error('[ResumeSub] unexpected error', error);
  return fail('INTERNAL', '内部错误，请重试');
}

export function createRouter(deps: RouterDeps) {
  return async function handle(raw: unknown, sender: SenderLike): Promise<Response<unknown>> {
    const kind = classifySender(sender, deps.extId, deps.extOrigin);
    if (kind === 'unknown') return forbidden();
    // 先校验来源再解析请求：未授权页面连请求格式都不应得到反馈
    if (kind === 'content' && !(await contentOriginAllowed(sender, deps))) return forbidden();
    const parsed = v.safeParse(RequestSchema, raw);
    if (!parsed.success) return fail('BAD_REQUEST', '请求格式无效');
    const req = parsed.output;
    if (kind === 'content' && !CONTENT_ALLOWED.has(req.type)) return forbidden();
    try {
      return { ok: true, data: await dispatch(req, deps) };
    } catch (error) {
      return toFailure(error);
    }
  };
}
