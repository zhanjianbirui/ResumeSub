import { useMemo } from 'preact/hooks';
import type { ImportResult } from '@/import/import-resume';
import { mergeParsed } from '@/parser/merge';
import type { ParseWarning } from '@/parser/types';
import { call } from '@/shared/client';
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

export function ReviewView({ current, imported, onDone, onCancel }: Props) {
  const merged = useMemo(() => mergeParsed(current, imported.parse.profile), [current, imported]);
  const { warnings, text } = imported.parse;

  const save = async (profile: Profile) => {
    await call({ type: 'resume.import', profile, file: imported.file });
    onDone(profile);
  };

  return (
    <div>
      <h2>校对解析结果</h2>
      <p class="hint">左侧为简历原文，右侧为解析结果（已与现有档案合并）。核对无误后保存。</p>
      {warnings.length > 0 && (
        <ul class="warn">
          {warnings.map((w, i) => <li key={i}>{describeWarning(w)}</li>)}
        </ul>
      )}
      <div class="review">
        <pre class="raw" aria-label="简历原文">{text}</pre>
        <ProfileEditor initial={merged} onSave={save} saveLabel="确认导入并加密保存" />
      </div>
      <button type="button" onClick={onCancel}>放弃导入</button>
    </div>
  );
}
