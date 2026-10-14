import { useEffect, useState } from 'preact/hooks';
import { call, errorText } from '@/shared/client';
import { LLM_PRESETS, type LlmPreset, originPatternOf, presetFor } from '@/shared/llm-presets';
import type { LlmPublicSettings } from '@/shared/llm-types';
import { enableSites } from '@/shared/site-access';

interface Draft {
  presetId: string;
  provider: LlmPreset['protocol'];
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled: boolean;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

const PURPOSE: Readonly<Record<string, string>> = { map: '识别字段', parse: '解析简历', test: '测试连接' };

function draftFrom(s: LlmPublicSettings): Draft {
  const preset = s.baseUrl ? presetFor(s.provider, s.baseUrl) : LLM_PRESETS[0]!;
  return {
    presetId: preset.id, provider: s.baseUrl ? s.provider : preset.protocol,
    baseUrl: s.baseUrl || preset.baseUrl, model: s.model || preset.model, apiKey: '', enabled: s.baseUrl ? s.enabled : true,
  };
}

function LogTable({ log }: { log: LlmPublicSettings['log'] }) {
  if (log.length === 0) return <p class="hint">还没有调用记录。</p>;
  return (
    <ul class="plain">
      {log.map((e) => (
        <li key={e.at}>
          <span class={e.ok ? 'badge on' : 'badge'}>{e.ok ? '成功' : '失败'}</span>
          <span>{PURPOSE[e.purpose] ?? e.purpose}</span>
          <span class="hint">{e.model} · {e.ms}ms{e.detail ? ` · ${e.detail}` : ''}</span>
          <span class="spacer" />
          <span class="hint">{new Date(e.at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

export function AiSettings() {
  const [saved, setSaved] = useState<LlmPublicSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const load = () => call({ type: 'llm.get' }).then((s) => { setSaved(s); setDraft((d) => d ?? draftFrom(s)); });
  useEffect(() => { load().catch((e: unknown) => setNotice({ kind: 'error', text: errorText(e) })); }, []);
  if (!draft || !saved) return notice ? <p class="notice error">{notice.text}</p> : <p class="hint">加载中…</p>;

  const patch = (p: Partial<Draft>) => { setNotice(null); setDraft({ ...draft, ...p }); };
  const choose = (id: string) => {
    const preset = LLM_PRESETS.find((p) => p.id === id) ?? LLM_PRESETS[0]!;
    patch({ presetId: id, provider: preset.protocol, baseUrl: preset.baseUrl || draft.baseUrl, model: preset.model });
  };
  const preset = LLM_PRESETS.find((p) => p.id === draft.presetId);

  // 授权请求必须在点击事件里同步发起
  const save = () => {
    const pattern = originPatternOf(draft.baseUrl);
    if (!pattern || !draft.model.trim()) {
      setNotice({ kind: 'error', text: '请填写正确的接口地址和模型名称' });
      return;
    }
    setBusy(true);
    enableSites([pattern])
      .then(async (granted) => {
        if (!granted) throw new Error('需要允许访问模型接口地址才能调用');
        await call({ type: 'llm.save', ...draft });
        setDraft({ ...draft, apiKey: '' });
        await load();
        setNotice({ kind: 'ok', text: '已保存' });
      })
      .catch((e: unknown) => setNotice({ kind: 'error', text: e instanceof Error && !('code' in e) ? e.message : errorText(e) }))
      .finally(() => setBusy(false));
  };

  const test = () => {
    setBusy(true);
    setNotice(null);
    call({ type: 'llm.test' })
      .then((r) => setNotice({ kind: 'ok', text: `连接成功，模型回复：${r.reply || '（空）'}` }))
      .catch((e: unknown) => setNotice({ kind: 'error', text: errorText(e) }))
      .finally(() => { setBusy(false); void load(); });
  };

  return (
    <div>
      <div class="card">
        <h3>模型服务</h3>
        <div class="grid">
          <label>服务商
            <select value={draft.presetId} onChange={(e) => choose(e.currentTarget.value)}>
              {LLM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>模型名称
            <input value={draft.model} placeholder="例如 deepseek-chat" onInput={(e) => patch({ model: e.currentTarget.value })} />
          </label>
          <label>接口地址
            <input value={draft.baseUrl} placeholder="https://…/v1" onInput={(e) => patch({ baseUrl: e.currentTarget.value })} />
          </label>
          <label>API Key
            <input type="password" value={draft.apiKey} autoComplete="off"
              placeholder={saved.hasKey ? `已保存 ${saved.keyHint}（留空则不修改）` : '粘贴你的 API Key'}
              onInput={(e) => patch({ apiKey: e.currentTarget.value })} />
          </label>
        </div>
        {preset?.keyUrl && <p class="hint">在 <a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.name} 控制台</a> 获取 API Key。模型名称可以改成该服务商的任意模型。</p>}
        <label class="row" style="flex-direction:row;align-items:center;color:var(--text)">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.currentTarget.checked })} />
          启用 AI 兜底（规则认不出的字段交给模型判断）
        </label>
        <div class="row">
          <button type="button" class="primary" disabled={busy} onClick={save}>保存</button>
          <button type="button" disabled={busy || !saved.hasKey} onClick={test}>测试连接</button>
          {notice && <span class={notice.kind} role="status">{notice.text}</span>}
        </div>
      </div>
      <div class="card">
        <h3>会发送什么</h3>
        <ul>
          <li><b>识别字段</b>（自动）：只发送规则认不出的表单字段的标签、提示文字和选项，以及档案字段名称列表；<b>不发送你的任何个人信息</b>。学到的结果按网站记住，同一网站下次不再调用。</li>
          <li><b>解析简历</b>（仅在导入简历时点击"用 AI 重新解析"）：会把简历全文发给你配置的模型。</li>
          <li>API Key 加密保存在本机，只发给你填写的接口地址。</li>
        </ul>
      </div>
      <div class="card">
        <h3>最近调用</h3>
        <LogTable log={saved.log} />
      </div>
    </div>
  );
}
