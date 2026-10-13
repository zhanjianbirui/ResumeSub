import type { Profile } from '@/shared/schema/profile';

export interface ParseWarning {
  path: string;
  message: string;
}

export interface Parsed<T> {
  value: T;
  warnings: ParseWarning[];
}

export interface ParseResult {
  profile: Profile;
  warnings: ParseWarning[];
  text: string;
}

/** 把 [条件, path, message] 列表转成警告，只保留条件为 true 的项。 */
export function warnings(checks: readonly (readonly [boolean, string, string])[]): ParseWarning[] {
  return checks.filter(([hit]) => hit).map(([, path, message]) => ({ path, message }));
}
