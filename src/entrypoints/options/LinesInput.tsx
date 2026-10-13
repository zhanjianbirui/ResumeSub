import { useEffect, useState } from 'preact/hooks';

export function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

interface Props {
  id: string;
  value: readonly string[];
  onChange: (lines: string[]) => void;
}

/** 输入时只更新本地草稿，失焦后才提交，这样换行和空行不会被立即吞掉。 */
export function LinesInput({ id, value, onChange }: Props) {
  const joined = value.join('\n');
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      id={id}
      rows={3}
      value={draft}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => onChange(splitLines(draft))}
    />
  );
}
