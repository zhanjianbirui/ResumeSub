import { removeAt, updateAt } from '@/shared/immutable';
import type { FieldDef } from './fields';
import { ObjectForm } from './ObjectForm';

interface Props<T> {
  title: string;
  fields: readonly FieldDef[];
  items: readonly T[];
  create: () => T;
  onChange: (items: T[]) => void;
  itemLabel: (item: T, index: number) => string;
}

export function ListSection<T extends Record<string, unknown>>(props: Props<T>) {
  const { title, fields, items, create, onChange, itemLabel } = props;
  return (
    <details class="card" open>
      <summary>{title}<span class="badge">{items.length}</span></summary>
      <div class="body">
        {items.map((item, i) => (
          <div class="entry" key={i}>
            <div class="entry-head">
              <span>{itemLabel(item, i) || `${title} ${i + 1}`}</span>
              <span class="spacer" />
              <button type="button" class="ghost" onClick={() => onChange(removeAt(items, i))}>删除</button>
            </div>
            <ObjectForm fields={fields} value={item} onChange={(next) => onChange(updateAt(items, i, next))} />
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, create()])}>+ 添加{title}</button>
      </div>
    </details>
  );
}
