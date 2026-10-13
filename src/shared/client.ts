import { browser } from 'wxt/browser';
import type { Request, RequestType, Response, ResponseMap } from './messages';

export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function call<K extends RequestType>(req: Extract<Request, { type: K }>): Promise<ResponseMap[K]> {
  const res = (await browser.runtime.sendMessage(req)) as Response<ResponseMap[K]> | undefined;
  if (!res) throw new ApiError('NO_RESPONSE', '后台无响应，请重试');
  if (!res.ok) throw new ApiError(res.error.code, res.error.message);
  return res.data;
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : '发生未知错误，请重试';
}
