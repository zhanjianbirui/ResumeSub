import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ImportResult } from '@/import/import-resume';
import { mergeParsed } from '@/parser/merge';
import type { ParseWarning } from '@/parser/types';
import { call, errorText } from '@/shared/client';
import type { Profile } from '@/shared/schema/profile';
import { ProfileEditor } from './ProfileEditor';

const SECTION_NAMES: Readonly<Record<string, string>> = {
  basic: '基本信息',
  education: '教育经历',
  experience: '实习 / 工作经历',
  projects: '项目经历',
  skills: '技能',
  awards: '荣誉奖项',
};

export function describeWarning({ path, message }: ParseWarning): string {
  const [section, index] = path.split('.');
  const name = SECTION_NAMES[section ?? ''] ?? '整体';
  const position = index !== undefined && /^\d+$/.test(index) ? ` 第 ${Number(index) + 1} 条` : '';
  return `${name}${position}：${message}`;
}

interface Props {
  current: Profile;
  imported: ImportResult;
  onDone: (profile: Profile) => void;
  onCancel: () => void;
}

/** AI 重新解析：只在用户点击时调用，会把简历全文发给已配置的模型。 */
function useAiParse(text: string) {
  const [available, setAvailable] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  useEffect(() => {
    call({ type: 'llm.get' }).then((s) => setAvailable(s.hasKey && s.baseUrl !== ''), () => setAvailable(false));
  }, []);
  const run = () => {
    setState({ busy: true, error: '' });
    call({ type: 'llm.parseResume', text })
      .then((p) => { setProfile(p); setState({ busy: false, error: '' }); })
      .catch((e: unknown) => setState({ busy: false, error: errorText(e) }));
  };
  return { available, profile, run, ...state };
}

export function ReviewView({ current, imported, onDone, onCancel }: Props) {
  const { warnings, text } = imported.parse;
  const ai = useAiParse(text);
  const parsed = ai.profile ?? imported.parse.profile;
  const merged = useMemo(() => mergeParsed(current, parsed), [current, parsed]);

  const save = async (profile: Profile) => {
    await call({ type: 'resume.import', profile, file: imported.file });
    onDone(profile);
  };

  return (
    <div>
      <div class="row">
        <h3>校对解析结果</h3>
        <span class="spacer" />
        {ai.available && (
          <button type="button" disabled={ai.busy} onClick={ai.run} title="会把简历全文发给你在“AI 模型”中配置的服务">
            {ai.busy ? 'AI 解析中…' : ai.profile ? '已用 AI 解析 ✓' : '用 AI 重新解析'}
          </button>
        )}
        <button type="button" class="ghost" onClick={onCancel}>放弃导入</button>
      </div>
      {ai.error && <p class="notice error" role="alert">{ai.error}</p>}
      <p class="hint">左侧为简历原文，右侧为解析结果（已与现有档案合并）。核对无误后点底部按钮保存。</p>
      {!ai.profile && warnings.length > 0 && (
        <ul class="notice warn">
          {warnings.map((w, i) => <li key={i}>{describeWarning(w)}</li>)}
        </ul>
      )}
      <div class="review">
        <pre class="raw" aria-label="简历原文">{text}</pre>
        <ProfileEditor key={ai.profile ? 'ai' : 'rules'} initial={merged} onSave={save} saveLabel="确认导入并保存" />
      </div>
    </div>
  );
}
