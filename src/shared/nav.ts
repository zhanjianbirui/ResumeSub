import { browser } from 'wxt/browser';

export type OptionsTab = 'profile' | 'import' | 'sites' | 'data';

/** 在新标签页打开设置页的某一页（openOptionsPage 不支持带 hash）。 */
export function openOptions(tab: OptionsTab): void {
  void browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#${tab}` });
}
