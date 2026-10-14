import { describe, expect, it, vi } from 'vitest';
import { mapFieldsWithLlm, memoryKey } from '@/background/llm/map-fields';
import type { FieldDescriptor } from '@/shared/autofill-types';

const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' };
const desc = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  signature: label, kind: 'text', label, name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0, ...extra,
});

describe('mapFieldsWithLlm', () => {
  it('sends only field descriptions and candidate keys, and keeps confident known paths', async () => {
    const chat = vi.fn(async () => JSON.stringify({ mappings: [
      { i: 0, path: 'basic.email', confidence: 0.95 },
      { i: 1, path: 'education.school', confidence: 0.5 },
      { i: 2, path: 'basic.secret', confidence: 0.99 },
      { i: 3, path: null, confidence: 0.9 },
    ] }));
    const result = await mapFieldsWithLlm(
      [desc('联络用电子信箱'), desc('就读院所'), desc('奇怪'), desc('备注')], ['是否接受调剂'], cfg, chat,
    );
    expect([...result]).toEqual([[0, 'basic.email']]);
    const sent = (chat.mock.calls[0] as unknown as [unknown, { user: string }])[1].user;
    expect(sent).toContain('联络用电子信箱');
    expect(sent).toContain('custom:是否接受调剂');
  });

  it('requires higher confidence for sensitive fields', async () => {
    const chat = vi.fn(async () => '{"mappings":[{"i":0,"path":"basic.idNumber","confidence":0.8}]}');
    expect((await mapFieldsWithLlm([desc('证照号')], [], cfg, chat)).size).toBe(0);
  });

  it('does nothing for an empty field list', async () => {
    const chat = vi.fn();
    expect((await mapFieldsWithLlm([], [], cfg, chat)).size).toBe(0);
    expect(chat).not.toHaveBeenCalled();
  });

  it('builds stable memory keys from kind, label and section group', () => {
    expect(memoryKey(desc('* 毕业学校：', { section: '教育经历' }))).toBe(memoryKey(desc('毕业学校', { section: '教育背景' })));
    expect(memoryKey(desc('学校'))).not.toBe(memoryKey(desc('学校', { kind: 'select' })));
  });
});
