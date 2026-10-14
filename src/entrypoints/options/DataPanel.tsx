import { useState } from 'preact/hooks';
import { call, errorText } from '@/shared/client';

interface Props {
  legacy: boolean;
  onReset: () => void;
}

/** 隐私说明 + 清空数据（两步确认）。 */
export function DataPanel({ legacy, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = async () => {
    setBusy(true);
    setError('');
    try {
      await call({ type: 'vault.reset' });
      setConfirming(false);
      onReset();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {legacy && (
        <p class="notice warn">检测到旧版（使用主密码）的档案。新版不再需要密码，旧档案无法自动读取：请清空后重新导入简历。</p>
      )}
      <div class="card">
        <h3>数据存放在哪里</h3>
        <ul>
          <li>档案和简历文件只保存在本机浏览器中，使用插件自动生成的密钥加密，不需要密码。</li>
          <li>网页和其他扩展读不到档案；网申页面只会收到当前页面需要填写的那几个值。</li>
          <li>插件不会上传任何数据，也没有任何统计。</li>
          <li>提醒：能直接读取你电脑上浏览器数据目录的人可以解开档案，请注意电脑本身的安全。</li>
        </ul>
      </div>
      <div class="card">
        <h3>清空所有数据</h3>
        <p class="hint">删除档案、简历文件和导入记录，操作不可恢复。网站授权不受影响。</p>
        {!confirming && (
          <button type="button" class="danger" onClick={() => setConfirming(true)}>清空所有数据</button>
        )}
        {confirming && (
          <div class="row">
            <span class="error">确定要清空吗？</span>
            <button type="button" class="danger solid" disabled={busy} onClick={() => void reset()}>确认清空</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button>
          </div>
        )}
        {error && <p class="notice error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
