import { useEffect, useState } from 'preact/hooks';
import {
  currentTabOrigin, disableSites, enableSites, isSiteEnabled, listEnabledSites, originPattern,
} from '@/shared/site-access';

/** off：未授权；site：本站单独授权；preset：被常见网站等通配授权覆盖（只能在设置页管理）。 */
type Mode = 'off' | 'site' | 'preset';
type State = { kind: 'loading' } | { kind: 'unsupported' } | { kind: 'ready'; origin: string; mode: Mode };

async function readMode(origin: string): Promise<Mode> {
  if (!(await isSiteEnabled(origin))) return 'off';
  return (await listEnabledSites()).includes(originPattern(origin)) ? 'site' : 'preset';
}

async function readState(): Promise<State> {
  const origin = await currentTabOrigin();
  return origin ? { kind: 'ready', origin, mode: await readMode(origin) } : { kind: 'unsupported' };
}

const HINTS: Readonly<Record<Mode, string>> = {
  off: '',
  site: '：已启用自动填写',
  preset: '：已通过常见网站授权启用，可在设置中管理',
};

export function SiteToggle() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    readState().then(setState, (e: unknown) => {
      console.error('[ResumeSub] read site state failed', e);
      setState({ kind: 'unsupported' });
    });
  }, []);

  if (state.kind === 'loading') return null;
  if (state.kind === 'unsupported') return <p class="hint">当前页面不支持自动填写</p>;

  // permissions.request 必须在点击事件中同步发起，否则浏览器会认为不是用户操作而拒绝
  const toggle = () => {
    if (pending) return;
    const enabling = state.mode === 'off';
    const patterns = [originPattern(state.origin)];
    setError('');
    setPending(true);
    (enabling ? enableSites(patterns) : disableSites(patterns))
      .then((ok) => {
        if (ok) setState({ ...state, mode: enabling ? 'site' : 'off' });
        else setError(enabling ? '未获得授权' : '停用失败');
      })
      .catch((e: unknown) => {
        console.error('[ResumeSub] toggle site failed', e);
        setError(enabling ? '操作失败，请重试' : '停用失败');
      })
      .finally(() => setPending(false));
  };

  return (
    <section>
      <p class="hint">{state.origin}{HINTS[state.mode]}</p>
      {state.mode !== 'preset' && (
        <button type="button" class={state.mode === 'off' ? 'primary' : ''} disabled={pending} onClick={toggle}>
          {state.mode === 'off' ? '在此网站启用自动填写' : '在此网站停用'}
        </button>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
