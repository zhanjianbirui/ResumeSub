import { useEffect, useState } from 'preact/hooks';
import { call, errorText } from '@/shared/client';
import type { Prefs } from '@/shared/schema/prefs';

const OPTIONS: readonly { value: Prefs['autoLockMinutes']; label: string }[] = [
  { value: 15, label: '闲置 15 分钟' },
  { value: 60, label: '闲置 1 小时' },
  { value: 0, label: '直到关闭浏览器' },
];

export function PrefsForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    call({ type: 'prefs.get' }).then(setPrefs).catch((e) => setError(errorText(e)));
  }, []);

  const change = async (autoLockMinutes: Prefs['autoLockMinutes']) => {
    const next: Prefs = { autoLockMinutes };
    setError('');
    try {
      await call({ type: 'prefs.save', prefs: next });
      setPrefs(next);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section>
      <h2>安全设置</h2>
      {prefs && (
        <label>
          自动上锁
          <select value={String(prefs.autoLockMinutes)}
            onChange={(e) => void change(Number(e.currentTarget.value) as Prefs['autoLockMinutes'])}>
            {OPTIONS.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
