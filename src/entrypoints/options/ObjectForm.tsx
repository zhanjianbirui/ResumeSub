import { FieldInput } from './FieldInput';
import type { FieldDef } from './fields';

interface Props<T> {
  fields: readonly FieldDef[];
  value: T;
  onChange: (next: T) => void;
}

export function ObjectForm<T extends Record<string, unknown>>({ fields, value, onChange }: Props<T>) {
  return (
    <div class="grid">
      {fields.map((def) => (
        <FieldInput
          key={def.key}
          def={def}
          value={value[def.key]}
          onChange={(fieldValue) => onChange({ ...value, [def.key]: fieldValue } as T)}
        />
      ))}
    </div>
  );
}
