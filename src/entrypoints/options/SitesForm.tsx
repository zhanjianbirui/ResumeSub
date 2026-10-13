import { useEffect, useState } from 'preact/hooks';
import { disableSites, enableSites, listEnabledSites } from '@/shared/site-access';
import { PRESET_SITES } from '@/shared/sites';

export function SitesForm() {
  const [sites, setSites] = useState<string[]>([]);
  const [error, setError] = useState('');

  const refresh = () => listEnabledSites().then(setSites).catch((e: unknown) => {
    console.error('[ResumeSub] list sites failed', e);
    setError('读取授权站点失败');
  });

  useEffect(() => {
    void refresh();
  }, []);

  const run = (action: Promise<boolean>) => {
    setError('');
    action.then((ok) => (ok ? refresh() : setError('未获得授权'))).catch((e: unknown) => {
      console.error('[ResumeSub] update sites failed', e);
      setError('操作失败，请重试');
    });
  };

  return (
    <section>
      <h2>自动填写站点</h2>
      <p class="hint">只有授权过的网站才会自动填写。常见招聘系统：{[...new Set(PRESET_SITES.map((s) => s.name))].join('、')}。</p>
      <button type="button" class="primary" onClick={() => run(enableSites(PRESET_SITES.map((s) => s.pattern)))}>
        一键授权常见招聘网站
      </button>
      <ul>
        {sites.map((site) => (
          <li key={site} class="row">
            <span>{site}</span>
            <button type="button" onClick={() => run(disableSites([site]))}>移除</button>
          </li>
        ))}
      </ul>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
