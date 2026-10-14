import { describe, expect, it, vi } from 'vitest';
import { planWithFallback } from '@/background/autofill/plan';
import { memoryKey } from '@/background/llm/map-fields';
import type { FieldDescriptor } from '@/shared/autofill-types';
import { emptyProfile } from '@/shared/schema/profile';
import { emptyVaultData, type VaultData } from '@/shared/schema/vault-data';

const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' };
const desc = (signature: string, label: string): FieldDescriptor => ({
  signature, kind: 'text', label, name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0,
});

function data(): VaultData {
  const base = emptyProfile();
  return { ...emptyVaultData(), profile: { ...base, basic: { ...base.basic, name: '李明', email: 'li@example.com', phone: '13800138000' } } };
}

describe('planWithFallback', () => {
  it('uses rules first, then site memory, then the model — never sending profile values', async () => {
    const chat = vi.fn(async () => '{"mappings":[{"i":0,"path":"basic.email","confidence":0.95}]}');
    const fields = [desc('a', '姓名'), desc('b', '联系手段'), desc('c', '联络用电子信箱'), desc('d', '紧急联系人电话')];
    const memory = { [memoryKey(fields[1]!)]: 'basic.phone' };
    const result = await planWithFallback(fields, data(), { memory, llm: { cfg, chat } });
    expect(result.fills).toEqual([
      { signature: 'a', value: '李明' },
      { signature: 'b', value: '13800138000', source: 'memory' },
      { signature: 'c', value: 'li@example.com', source: 'llm' },
    ]);
    expect(result.learned).toEqual({ [memoryKey(fields[2]!)]: 'basic.email' });
    const sent = (chat.mock.calls[0] as unknown as [unknown, { user: string }])[1].user;
    expect(sent).toContain('联络用电子信箱');
    for (const secret of ['李明', 'li@example.com', '13800138000', '紧急联系人']) expect(sent).not.toContain(secret);
  });

  it('falls back to rules only when the model fails or is not configured', async () => {
    const onLlmError = vi.fn();
    const chat = vi.fn(async () => { throw new Error('down'); });
    const fields = [desc('a', '姓名'), desc('c', '联络用电子信箱')];
    const failed = await planWithFallback(fields, data(), { memory: {}, llm: { cfg, chat }, onLlmError });
    expect(failed.fills).toEqual([{ signature: 'a', value: '李明' }]);
    expect(onLlmError).toHaveBeenCalled();
    const none = await planWithFallback(fields, data(), { memory: {} });
    expect(none.fills).toEqual([{ signature: 'a', value: '李明' }]);
  });

  it('ignores stale memory entries pointing at unknown paths', async () => {
    const fields = [desc('b', '联系手段')];
    const result = await planWithFallback(fields, data(), { memory: { [memoryKey(fields[0]!)]: 'basic.nope' } });
    expect(result.fills).toEqual([]);
  });
});
