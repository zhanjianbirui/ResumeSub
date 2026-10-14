import { useEffect, useState } from 'preact/hooks';
import type { ImportResult } from '@/import/import-resume';
import { call, errorText } from '@/shared/client';
import type { AppStatus } from '@/shared/messages';
import type { OptionsTab } from '@/shared/nav';
import type { Profile } from '@/shared/schema/profile';
import { AiSettings } from './AiSettings';
import { DataPanel } from './DataPanel';
import { ProfileEditor } from './ProfileEditor';
import { ResumeImport } from './ResumeImport';
import { ReviewView } from './ReviewView';
import { SitesForm } from './SitesForm';

const TABS: readonly { id: OptionsTab; label: string; hint: string }[] = [
  { id: 'profile', label: '档案', hint: '自动填写使用的个人信息，修改后点底部"保存档案"。' },
  { id: 'import', label: '导入简历', hint: '从 PDF / Word 简历自动提取信息，校对后保存。' },
  { id: 'sites', label: '自动填写网站', hint: '只有授权过的网站才会自动填写。' },
  { id: 'ai', label: 'AI 模型', hint: '可选：配置后，规则认不出的字段由大模型判断，也可以用 AI 解析简历。不配置也能正常使用。' },
  { id: 'data', label: '数据与隐私', hint: '数据只保存在本机。' },
];

const tabFromHash = (): OptionsTab => {
  const id = location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as OptionsTab) : 'profile';
};

type Data =
  | { kind: 'loading' }
  | { kind: 'error'; text: string }
  | { kind: 'ready'; status: AppStatus; profile: Profile | null };

async function loadData(): Promise<Data> {
  const status = await call({ type: 'app.status' });
  const profile = status.legacy ? null : await call({ type: 'profile.get' });
  return { kind: 'ready', status, profile };
}

function useHashTab(): [OptionsTab, (tab: OptionsTab) => void] {
  const [tab, setTab] = useState<OptionsTab>(tabFromHash);
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [tab, (next) => { location.hash = next; setTab(next); }];
}

export function App() {
  const [tab, go] = useHashTab();
  const [data, setData] = useState<Data>({ kind: 'loading' });
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [notice, setNotice] = useState('');
  // 只在导入或清空后重建编辑器（普通保存不重建，保留"已保存"提示和折叠状态）
  const [version, setVersion] = useState(0);

  const reload = () => loadData().then(setData, (e: unknown) => setData({ kind: 'error', text: errorText(e) }));
  useEffect(() => { void reload(); }, []);

  const saveProfile = async (profile: Profile) => {
    await call({ type: 'profile.save', profile });
    void reload();
  };
  const finishImport = () => {
    setImported(null);
    setNotice('简历已导入，档案已更新。');
    setVersion((n) => n + 1);
    void reload().then(() => go('profile'));
  };

  const current = TABS.find((t) => t.id === tab) ?? TABS[0]!;
  return (
    <div class="shell">
      <nav class="nav">
        <div class="brand"><img src="/icon/32.png" alt="" /><h1>ResumeSub</h1></div>
        {TABS.map((t) => (
          <a key={t.id} class={t.id === tab ? 'active' : ''} onClick={() => go(t.id)}>{t.label}</a>
        ))}
      </nav>
      <main class="content">
        <h2>{current.label}</h2>
        <p class="hint">{current.hint}</p>
        {notice && <p class="notice ok" role="status">{notice}</p>}
        {data.kind === 'loading' && <p class="hint">加载中…</p>}
        {data.kind === 'error' && <p class="notice error" role="alert">{data.text}</p>}
        {data.kind === 'ready' && renderTab(tab, data, {
          go, imported, setImported, saveProfile, finishImport, version, onReset: () => { setNotice('数据已清空。'); setVersion((n) => n + 1); void reload(); },
        })}
      </main>
    </div>
  );
}

interface TabCtx {
  go: (tab: OptionsTab) => void;
  imported: ImportResult | null;
  setImported: (r: ImportResult | null) => void;
  saveProfile: (p: Profile) => Promise<void>;
  finishImport: () => void;
  onReset: () => void;
  version: number;
}

function LegacyNotice({ go }: { go: (tab: OptionsTab) => void }) {
  return (
    <p class="notice warn">
      检测到旧版（使用主密码）的档案，需要先清空。<a onClick={() => go('data')}>前往"数据与隐私"处理</a>
    </p>
  );
}

function renderTab(tab: OptionsTab, data: Extract<Data, { kind: 'ready' }>, ctx: TabCtx) {
  const { status, profile } = data;
  if (tab === 'sites') return <SitesForm />;
  if (tab === 'ai') return <AiSettings />;
  if (tab === 'data') return <DataPanel legacy={status.legacy} onReset={ctx.onReset} />;
  if (status.legacy || !profile) return <LegacyNotice go={ctx.go} />;
  if (tab === 'import') {
    if (ctx.imported) {
      return <ReviewView current={profile} imported={ctx.imported} onDone={ctx.finishImport} onCancel={() => ctx.setImported(null)} />;
    }
    return (
      <div>
        {status.resumeName && <p class="hint">当前简历文件：{status.resumeName}（重新导入会替换）</p>}
        <ResumeImport onImported={ctx.setImported} />
      </div>
    );
  }
  return <ProfileEditor key={ctx.version} initial={profile} onSave={ctx.saveProfile} />;
}
