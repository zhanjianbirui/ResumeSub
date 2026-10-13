import { useId } from 'preact/hooks';
import type { FieldDef } from './fields';
import { LinesInput } from './LinesInput';

type Value = string | string[];

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (value: Value) => void;
}

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];

function MonthInput({ id, value, allowPresent, onChange }: {
  id: string; value: string; allowPresent?: boolean; onChange: (value: string) => void;
}) {
  const isPresent = value === 'present';
  return (
    <span class="month">
      <input id={id} type="month" value={isPresent ? '' : value} disabled={isPresent}
        onInput={(e) => onChange(e.currentTarget.value)} />
      {allowPresent && (
        <label>
          <input type="checkbox" checked={isPresent}
            onChange={(e) => onChange(e.currentTarget.checked ? 'present' : '')} />
          至今
        </label>
      )}
    </span>
  );
}

function Control({ id, def, value, onChange }: Props & { id: string }) {
  switch (def.kind ?? 'text') {
    case 'lines':
      return <LinesInput id={id} value={toList(value)} onChange={onChange} />;
    case 'select':
      return (
        <select id={id} value={toText(value)} onChange={(e) => onChange(e.currentTarget.value)}>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'month':
      return <MonthInput id={id} value={toText(value)} allowPresent={def.allowPresent} onChange={onChange} />;
    case 'date':
      return <input id={id} type="date" value={toText(value)} onInput={(e) => onChange(e.currentTarget.value)} />;
    default:
      return <input id={id} type="text" value={toText(value)} onInput={(e) => onChange(e.currentTarget.value)} />;
  }
}

export function FieldInput(props: Props) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.def.label}</label>
      <Control id={id} {...props} />
    </div>
  );
}
