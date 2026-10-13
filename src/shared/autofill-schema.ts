import * as v from 'valibot';
import { FIELD_KINDS } from './autofill-types';

export const MAX_FIELDS = 300;

const text = (max: number) => v.pipe(v.string(), v.maxLength(max));

export const FieldDescriptorSchema = v.object({
  signature: text(64),
  kind: v.picklist(FIELD_KINDS),
  label: text(200),
  name: text(200),
  id: text(200),
  placeholder: text(200),
  autocomplete: text(100),
  section: text(200),
  options: v.optional(v.pipe(v.array(v.object({ value: text(200), label: text(200) })), v.maxLength(500))),
});

export const AutofillPlanSchema = v.object({
  type: v.literal('autofill.plan'),
  url: text(2048),
  fields: v.pipe(v.array(FieldDescriptorSchema), v.maxLength(MAX_FIELDS)),
});
