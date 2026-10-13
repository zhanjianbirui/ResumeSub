/** 站点专用适配器（Workday、北森等），等有真实页面样本后再注册具体实现。 */
export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  labelFor?(el: HTMLElement): string | null;
}

export const ADAPTERS: readonly SiteAdapter[] = [];

export function activeAdapter(url: string, adapters: readonly SiteAdapter[] = ADAPTERS): SiteAdapter | null {
  try {
    const parsed = new URL(url);
    return adapters.find((a) => a.matches(parsed)) ?? null;
  } catch {
    return null;
  }
}
