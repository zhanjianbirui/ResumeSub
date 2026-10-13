import { useEffect, useState } from 'preact/hooks';
import { currentTabOrigin, disableSites, enableSites, isSiteEnabled, originPattern } from '@/shared/site-access';

type State = { kind: 'loading' } | { kind: 'unsupported' } | { kind: 'ready'; origin: string; enabled: boolean };

export function SiteToggle() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const origin = await currentTabOrigin();
      setState(origin ? { kind: 'ready', origin, enabled: await isSiteEnabled(origin) } : { kind: 'unsupported' });
    })().catch((e: unknown) => {
      console.error('[ResumeSub] read site state failed', e);
      setState({ kind: 'unsupported' });
    });
  }, []);

  if (state.kind === 'loading') return null;
  if (state.kind === 'unsupported') return <p class="hint">当前页面不支持自动填写</p>;

  // permissions.request 必须在点击事件中同步发起，否则浏览器会认为不是用户操作而拒绝
  const toggle = () => {
    setError('');
    const patterns = [originPattern(state.origin)];
    const action = state.enabled ? disableSites(patterns) : enableSites(patterns);
    action
      .then((ok) => {
        if (ok) setState({ ...state, enabled: !state.enabled });
        else setError('未获得授权');
      })
      .catch((e: unknown) => {
        console.error('[ResumeSub] toggle site failed', e);
        setError('操作失败，请重试');
      });
  };

  return (
    <section>
      <p class="hint">{state.origin}{state.enabled ? '：已启用自动填写（刷新页面后生效）' : ''}</p>
      <button type="button" class={state.enabled ? '' : 'primary'} onClick={toggle}>
        {state.enabled ? '在此网站停用' : '在此网站启用自动填写'}
      </button>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
