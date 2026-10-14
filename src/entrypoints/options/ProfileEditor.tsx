import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import * as v from 'valibot';
import { errorText } from '@/shared/client';
import {
  emptyAward, emptyEducation, emptyExperience, emptyProject, type Profile, ProfileSchema,
} from '@/shared/schema/profile';
import { CustomFields } from './CustomFields';
import {
  AWARD_FIELDS, BASIC_FIELDS, EDUCATION_FIELDS, EXPERIENCE_FIELDS, PREFERENCES_FIELDS, PROJECT_FIELDS, SKILLS_FIELDS,
} from './fields';
import { ListSection } from './ListSection';
import { ObjectForm } from './ObjectForm';

export function firstIssue(profile: Profile): string | null {
  const result = v.safeParse(ProfileSchema, profile);
  if (result.success) return null;
  const issue = result.issues[0];
  const path = v.getDotPath(issue);
  return path ? `${path}：${issue.message}` : issue.message;
}

interface Props {
  initial: Profile;
  onSave: (profile: Profile) => Promise<void>;
  saveLabel?: string;
}

type Notice = { kind: 'ok' | 'error'; text: string };

function useSaveProfile(onSave: (profile: Profile) => Promise<void>) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (draft: Profile) => {
    const problem = firstIssue(draft);
    if (problem) {
      setNotice({ kind: 'error', text: problem });
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setNotice({ kind: 'ok', text: '已保存' });
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return { notice, setNotice, saving, save };
}

export function ProfileEditor({ initial, onSave, saveLabel = '保存档案' }: Props) {
  const [draft, setDraft] = useState<Profile>(initial);
  const { notice, setNotice, saving, save } = useSaveProfile(onSave);

  const patch = <K extends keyof Profile>(key: K) => (value: Profile[K]) => {
    setNotice(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div>
      <Card title="基本信息">
        <ObjectForm fields={BASIC_FIELDS} value={draft.basic} onChange={patch('basic')} />
      </Card>
      <ListSection title="教育经历" fields={EDUCATION_FIELDS} items={draft.education}
        create={emptyEducation} onChange={patch('education')} itemLabel={(e) => e.school} />
      <ListSection title="实习 / 工作经历" fields={EXPERIENCE_FIELDS} items={draft.experience}
        create={emptyExperience} onChange={patch('experience')} itemLabel={(e) => e.company} />
      <ListSection title="项目经历" fields={PROJECT_FIELDS} items={draft.projects}
        create={emptyProject} onChange={patch('projects')} itemLabel={(p) => p.name} />
      <Card title="技能">
        <ObjectForm fields={SKILLS_FIELDS} value={draft.skills} onChange={patch('skills')} />
      </Card>
      <ListSection title="荣誉奖项" fields={AWARD_FIELDS} items={draft.awards}
        create={emptyAward} onChange={patch('awards')} itemLabel={(a) => a.name} />
      <Card title="求职偏好" open={false}>
        <ObjectForm fields={PREFERENCES_FIELDS} value={draft.preferences} onChange={patch('preferences')} />
      </Card>
      <Card title="自定义字段" open={false}>
        <CustomFields value={draft.custom} onChange={patch('custom')} />
      </Card>
      <div class="savebar">
        <button type="button" class="primary" disabled={saving} onClick={() => void save(draft)}>{saveLabel}</button>
        {notice && <span class={notice.kind} role="status">{notice.text}</span>}
      </div>
    </div>
  );
}

function Card({ title, open = true, children }: { title: string; open?: boolean; children: ComponentChildren }) {
  return (
    <details class="card" open={open}>
      <summary>{title}</summary>
      <div class="body">{children}</div>
    </details>
  );
}
