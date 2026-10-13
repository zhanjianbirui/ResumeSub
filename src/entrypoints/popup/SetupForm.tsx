import { useState } from 'preact/hooks';
import { MIN_PASSWORD_LENGTH } from '@/shared/constants';

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `主密码至少需要 ${MIN_PASSWORD_LENGTH} 位`;
  if (password !== confirm) return '两次输入的密码不一致';
  return null;
}

export function SetupForm({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();
    const issue = validateNewPassword(password, confirm);
    setProblem(issue);
    if (!issue) onSubmit(password);
  };

  return (
    <form onSubmit={submit}>
      <p>首次使用，请设置主密码（至少 {MIN_PASSWORD_LENGTH} 位）。</p>
      <p class="warn">⚠️ 主密码不会被保存，忘记后数据无法恢复。</p>
      <label>
        主密码
        <input type="password" autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
      </label>
      <label>
        确认主密码
        <input type="password" value={confirm} onInput={(e) => setConfirm(e.currentTarget.value)} />
      </label>
      {problem && <p class="error">{problem}</p>}
      <button type="submit">创建加密档案</button>
    </form>
  );
}
