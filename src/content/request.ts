import type { FieldDescriptor, PlanResponse } from '@/shared/autofill-types';

type PlanReply = { ok: true; data: PlanResponse } | { ok: false; error: { message: string } } | undefined;
type Send = (message: unknown) => Promise<unknown>;

interface LocationLike {
  origin: string;
  pathname: string;
}

/** 只上报 origin + path：查询串和片段里可能有令牌等敏感信息。 */
export const planUrl = (loc: LocationLike): string => `${loc.origin}${loc.pathname}`;

export async function requestPlan(send: Send, loc: LocationLike, fields: FieldDescriptor[]): Promise<PlanResponse> {
  const res = (await send({ type: 'autofill.plan', url: planUrl(loc), fields })) as PlanReply;
  if (!res) throw new Error('no response');
  if (!res.ok) throw new Error(res.error.message);
  return res.data;
}
