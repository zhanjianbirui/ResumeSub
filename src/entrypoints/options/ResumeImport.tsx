import { useState } from 'preact/hooks';
import { ImportError } from '@/import/errors';
import { type ImportResult, importResume } from '@/import/import-resume';
import { RESUME_MIMES } from '@/shared/constants';

const ACCEPT = ['.pdf', '.docx', RESUME_MIMES.pdf, RESUME_MIMES.docx].join(',');

const importErrorText = (error: unknown) => (error instanceof ImportError ? error.message : '解析失败，请重试');

export function ResumeImport({ onImported }: { onImported: (result: ImportResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handle = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onImported(await importResume(file));
    } catch (e) {
      if (!(e instanceof ImportError)) console.error('[ResumeSub] resume import failed', e);
      setError(importErrorText(e));
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  return (
    <div class="dropzone">
      <h3>选择简历文件</h3>
      <p class="hint">支持 PDF / DOCX（2MB 以内）。解析全程在本机完成，不会上传；解析后可以先校对再保存。</p>
      <input type="file" aria-label="选择简历文件" accept={ACCEPT} disabled={busy}
        onChange={(e) => void handle(e.currentTarget)} />
      {busy && <p class="hint">解析中…</p>}
      {error && <p class="notice error" role="alert">{error}</p>}
    </div>
  );
}
