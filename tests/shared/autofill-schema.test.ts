import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { FieldDescriptorSchema, MAX_FIELDS } from '@/shared/autofill-schema';
import { RequestSchema } from '@/shared/messages';
import { ResumeFileSchema } from '@/shared/schema/vault-data';
import { PRESET_SITES } from '@/shared/sites';

const field = {
  signature: 'abc-0', kind: 'text', label: '姓名', name: 'name', id: 'n1',
  placeholder: '', autocomplete: '', section: '基本信息', repeatIndex: 0,
};

describe('autofill schema', () => {
  it('accepts a valid descriptor and rejects unknown kinds or long labels', () => {
    expect(v.safeParse(FieldDescriptorSchema, field).success).toBe(true);
    expect(v.safeParse(FieldDescriptorSchema, { ...field, kind: 'password' }).success).toBe(false);
    expect(v.safeParse(FieldDescriptorSchema, { ...field, label: 'x'.repeat(201) }).success).toBe(false);
  });

  it('requires an integer repeatIndex between 0 and 50', () => {
    expect(v.safeParse(FieldDescriptorSchema, { ...field, repeatIndex: 50 }).success).toBe(true);
    expect(v.safeParse(FieldDescriptorSchema, { ...field, repeatIndex: 51 }).success).toBe(false);
    expect(v.safeParse(FieldDescriptorSchema, { ...field, repeatIndex: -1 }).success).toBe(false);
    expect(v.safeParse(FieldDescriptorSchema, { ...field, repeatIndex: 1.5 }).success).toBe(false);
    const { repeatIndex: _omit, ...missing } = field;
    expect(v.safeParse(FieldDescriptorSchema, missing).success).toBe(false);
  });

  it('bounds the number of fields in autofill.plan', () => {
    const ok = { type: 'autofill.plan', url: 'https://jobs.example.com/apply', fields: [field] };
    expect(v.safeParse(RequestSchema, ok).success).toBe(true);
    const tooMany = { ...ok, fields: Array.from({ length: MAX_FIELDS + 1 }, () => field) };
    expect(v.safeParse(RequestSchema, tooMany).success).toBe(false);
  });

  it('rejects resume files whose data is not base64', () => {
    const file = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(v.safeParse(ResumeFileSchema, file).success).toBe(true);
    expect(v.safeParse(ResumeFileSchema, { ...file, dataBase64: 'not base64!' }).success).toBe(false);
  });

  it('preset sites are http(s) match patterns', () => {
    expect(PRESET_SITES.length).toBeGreaterThan(5);
    for (const site of PRESET_SITES) expect(site.pattern).toMatch(/^https:\/\/[^/]+\/\*$/);
  });
});
