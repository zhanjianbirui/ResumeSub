import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { call, errorText } from '@/shared/client';
import type { VaultStatus } from '@/shared/messages';
import { SetupForm } from './SetupForm';
import { UnlockForm } from './UnlockForm';

export function App() {
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');
  const [error, setError] = useState('');

  const refresh = async () => setStatus((await call({ type: 'vault.status' })).status);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    void run(async () => {});
  }, []);

  return (
    <main class="popup">
      <h1>ResumeSub</h1>
      {status === 'loading' && <p>加载中…</p>}
      {status === 'uninitialized' && (
        <SetupForm onSubmit={(password) => void run(() => call({ type: 'vault.setup', password }))} />
      )}
      {status === 'locked' && (
        <UnlockForm onSubmit={(password) => void run(() => call({ type: 'vault.unlock', password }))} />
      )}
      {status === 'unlocked' && (
        <div class="row">
          <p>✅ 已解锁</p>
          <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>编辑档案</button>
          <button type="button" onClick={() => void run(() => call({ type: 'vault.lock' }))}>立即上锁</button>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </main>
  );
}
