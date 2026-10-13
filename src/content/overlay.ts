export type OverlayState =
  | { kind: 'locked' }
  | { kind: 'result'; filled: number; unfilled: number }
  | { kind: 'error'; message: string };

export interface Overlay {
  show(state: OverlayState): void;
  text(): string;
  destroy(): void;
}

const HOST_ID = 'resumesub-overlay';
const CSS = `
  .box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 13px/1.5 system-ui, -apple-system, 'PingFang SC', sans-serif;
    background: #fff; color: #1f2328; border: 1px solid #d0d7de; border-radius: 8px; padding: 8px 12px; box-shadow: 0 4px 12px rgba(0,0,0,.12); cursor: pointer; max-width: 320px; }
  .brand { font-weight: 600; margin-right: 6px; }
  .warn { color: #9a6700; } .error { color: #cf222e; }
`;

function describeState(state: OverlayState): { text: string; tone: string } {
  if (state.kind === 'locked') return { text: '🔒 档案已上锁：点击浏览器工具栏中的 ResumeSub 图标解锁后自动填写', tone: 'warn' };
  if (state.kind === 'error') return { text: `自动填写失败：${state.message}`, tone: 'error' };
  return { text: `已填 ${state.filled} · 未填 ${state.unfilled}（点击跳到未填字段）`, tone: '' };
}

export function createOverlay(doc: Document, onNext: () => void): Overlay {
  const host = doc.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = CSS;
  const box = doc.createElement('div');
  box.className = 'box';
  box.addEventListener('click', onNext);
  shadow.append(style, box);
  return {
    show(state) {
      const { text, tone } = describeState(state);
      const brand = doc.createElement('span');
      brand.className = 'brand';
      brand.textContent = 'ResumeSub';
      const body = doc.createElement('span');
      body.className = tone;
      body.textContent = text;
      box.replaceChildren(brand, body);
      if (!host.isConnected) {
        doc.getElementById(HOST_ID)?.remove(); // 页面上始终只保留一个浮层
        doc.documentElement.appendChild(host);
      }
    },
    text: () => box.textContent ?? '',
    destroy: () => host.remove(),
  };
}
