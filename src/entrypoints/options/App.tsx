import { useEffect, useState } from 'preact/hooks';
import type { ImportResult } from '@/import/import-resume';
import { ApiError, call, errorText } from '@/shared/client';
import type { Profile } from '@/shared/schema/profile';
import { PrefsForm } from './PrefsForm';
import { ProfileEditor } from './ProfileEditor';
import { ResumeImport } from './ResumeImport';
import { ReviewView } from './ReviewView';

type View =
  | { kind: 'loading' }
  | { kind: 'blocked'; text: string }
  | { kind: 'ready'; profile: Profile }
  | { kind: 'review'; profile: Profile; imported: ImportResult };

function blockedText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'LOCKED') {
    return '档案已上锁：请点击浏览器工具栏中的 ResumeSub 图标，输入主密码解锁。';
  }
  if (error instanceof ApiError && error.code === 'NOT_INITIALIZED') {
    return '尚未创建档案：请先点击工具栏中的 ResumeSub 图标设置主密码。';
  }
  return errorText(error);
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = async () => {
    setView({ kind: 'loading' });
    try {
      setView({ kind: 'ready', profile: await call({ type: 'profile.get' }) });
    } catch (error) {
      setView({ kind: 'blocked', text: blockedText(error) });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (profile: Profile) => {
    await call({ type: 'profile.save', profile });
    setView({ kind: 'ready', profile });
  };

  return (
    <main class="options">
      <h1>ResumeSub 档案</h1>
      {view.kind === 'loading' && <p>加载中…</p>}
      {view.kind === 'blocked' && (
        <div>
          <p role="alert">{view.text}</p>
          <button type="button" onClick={() => void load()}>我已解锁，重新加载</button>
        </div>
      )}
      {view.kind === 'ready' && (
        <>
          <ResumeImport onImported={(imported) => setView({ kind: 'review', profile: view.profile, imported })} />
          <ProfileEditor initial={view.profile} onSave={save} />
          <PrefsForm />
        </>
      )}
      {view.kind === 'review' && (
        <ReviewView
          current={view.profile}
          imported={view.imported}
          onDone={(profile) => setView({ kind: 'ready', profile })}
          onCancel={() => setView({ kind: 'ready', profile: view.profile })}
        />
      )}
    </main>
  );
}
