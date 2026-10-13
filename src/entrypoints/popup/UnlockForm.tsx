import { useState } from 'preact/hooks';

export function UnlockForm({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');

  const submit = (event: Event) => {
    event.preventDefault();
    onSubmit(password);
    setPassword('');
  };

  return (
    <form onSubmit={submit}>
      <label>
        主密码
        <input type="password" autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
      </label>
      <button type="submit">解锁</button>
    </form>
  );
}
