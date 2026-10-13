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
    <section>
      <h2>{title}</h2>
      {items.map((item, i) => (
        <fieldset key={i}>
          <legend>{itemLabel(item, i) || `${title} ${i + 1}`}</legend>
          <ObjectForm fields={fields} value={item} onChange={(next) => onChange(updateAt(items, i, next))} />
          <button type="button" onClick={() => onChange(removeAt(items, i))}>删除</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...items, create()])}>+ 添加{title}</button>
    </section>
  );
}
