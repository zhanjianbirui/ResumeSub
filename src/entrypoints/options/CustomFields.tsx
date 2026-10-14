import { useState } from 'preact/hooks';
import { removeAt, updateAt } from '@/shared/immutable';

type Entry = readonly [string, string];

interface Props {
  value: Readonly<Record<string, string>>;
  onChange: (next: Record<string, string>) => void;
}

/** 编辑中的空 key 行只保留在本地，提交给上层时过滤掉。 */
export function CustomFields({ value, onChange }: Props) {
  const [entries, setEntries] = useState<readonly Entry[]>(() => Object.entries(value));

  const commit = (next: readonly Entry[]) => {
    setEntries(next);
    onChange(Object.fromEntries(next.filter(([key]) => key.trim() !== '')));
  };

  return (
    <div>
      <p class="hint">简历里没有、但网申常问的内容，例如“是否接受调剂”。</p>
      {entries.map(([key, text], i) => (
        <div class="row" key={i}>
          <input aria-label={`字段名 ${i + 1}`} value={key}
            onInput={(e) => commit(updateAt(entries, i, [e.currentTarget.value, text] as const))} />
          <input aria-label={`字段值 ${i + 1}`} value={text}
            onInput={(e) => commit(updateAt(entries, i, [key, e.currentTarget.value] as const))} />
          <button type="button" class="ghost" onClick={() => commit(removeAt(entries, i))}>删除</button>
        </div>
      ))}
      <button type="button" onClick={() => commit([...entries, ['', ''] as const])}>+ 添加字段</button>
    </div>
  );
}
