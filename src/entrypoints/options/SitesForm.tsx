import { useEffect, useState } from 'preact/hooks';
import { disableSites, enableSites, listEnabledSites } from '@/shared/site-access';
import { PRESET_SITES } from '@/shared/sites';

interface Failure {
  denied: string;
  failed: string;
}

const GRANT_FAILURE: Failure = { denied: '未获得授权', failed: '操作失败，请重试' };
const REMOVE_FAILURE: Failure = { denied: '移除失败', failed: '移除失败' };
const PRESET_NAMES = [...new Set(PRESET_SITES.map((s) => s.name))].join('、');

export function SitesForm() {
  const [sites, setSites] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const refresh = () => listEnabledSites().then(setSites).catch((e: unknown) => {
    console.error('[ResumeSub] list sites failed', e);
    setError('读取授权站点失败');
  });

  useEffect(() => {
    void refresh();
  }, []);

  // 调用方在点击事件里同步发起 permissions 请求，这里只负责处理结果
  const run = (start: () => Promise<boolean>, failure: Failure) => {
    if (pending) return;
    setError('');
    setPending(true);
    start()
      .then((ok) => (ok ? refresh() : setError(failure.denied)))
      .catch((e: unknown) => {
        console.error('[ResumeSub] update sites failed', e);
        setError(failure.failed);
      })
      .finally(() => setPending(false));
  };

  return (
    <div>
      <div class="card">
        <h3>常见招聘网站</h3>
        <p class="hint">{PRESET_NAMES}</p>
        <button
          type="button" class="primary" disabled={pending}
          onClick={() => run(() => enableSites(PRESET_SITES.map((s) => s.pattern)), GRANT_FAILURE)}
        >
          一键授权常见招聘网站
        </button>
      </div>
      <div class="card">
        <h3>已授权的网站</h3>
        {sites.length === 0 && <p class="hint">还没有授权任何网站。也可以在网申页面点击工具栏图标单独启用。</p>}
        <ul class="plain">
          {sites.map((site) => (
            <li key={site}>
              <span>{site}</span>
              <span class="spacer" />
              <button type="button" class="ghost" disabled={pending} onClick={() => run(() => disableSites([site]), REMOVE_FAILURE)}>移除</button>
            </li>
          ))}
        </ul>
      </div>
      {error && <p class="notice error" role="alert">{error}</p>}
    </div>
  );
}
