import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { call, errorText } from '@/shared/client';
import type { AppStatus } from '@/shared/messages';
import { openOptions } from '@/shared/nav';
import { SiteToggle } from './SiteToggle';

/** 测试环境里没有扩展 API，取不到版本号时不显示。 */
const version = (): string => {
  const v = (browser as typeof browser | undefined)?.runtime?.getManifest?.().version;
  return v ? `v${v}` : '';
};

type View = { kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'ready'; status: AppStatus };

function ProfileCard({ status }: { status: AppStatus }) {
  if (status.legacy) {
    return (
      <div class="notice warn">
        <p>检测到旧版（带主密码）的档案，需要清空后重新导入简历。</p>
        <button type="button" class="block" onClick={() => openOptions('data')}>前往处理</button>
      </div>
    );
  }
  if (!status.hasProfile) {
    return (
      <div class="card">
        <h3>还没有档案</h3>
        <p class="hint">导入一份 PDF / Word 简历，之后打开网申页面就会自动填写。</p>
        <button type="button" class="primary block" onClick={() => openOptions('import')}>导入简历开始使用</button>
      </div>
    );
  }
  return (
    <div class="card row">
      <span class="badge on">档案已就绪</span>
      <span class="hint">{status.resumeName ?? '未附简历文件'}</span>
    </div>
  );
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    call({ type: 'app.status' }).then(
      (status) => setView({ kind: 'ready', status }),
      (e: unknown) => setView({ kind: 'error', text: errorText(e) }),
    );
  }, []);

  return (
    <main class="popup">
      <div class="brand">
        <img src="/icon/32.png" alt="" />
        <h1>ResumeSub</h1>
        <span class="ver">{version()}</span>
      </div>
      {view.kind === 'loading' && <p class="hint">加载中…</p>}
      {view.kind === 'error' && <p class="notice error" role="alert">{view.text}</p>}
      {view.kind === 'ready' && <ProfileCard status={view.status} />}
      <SiteToggle />
      <div class="links">
        <a onClick={() => openOptions('profile')}>编辑档案</a>
        <a onClick={() => openOptions('sites')}>网站管理</a>
      </div>
    </main>
  );
}
