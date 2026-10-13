// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFill } from '@/content/fill';
import { markField } from '@/content/mark';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
});

function fieldFor(html: string) {
  document.body.innerHTML = html;
  const [field] = scanFields(document);
  if (!field) throw new Error('no field');
  return field;
}

describe('applyFill', () => {
  it('sets text through the native setter and fires input/change', () => {
    const field = fieldFor('<label>姓名<input name="n"></label>');
    const events: string[] = [];
    field.element.addEventListener('input', () => events.push('input'));
    field.element.addEventListener('change', () => events.push('change'));
    expect(applyFill(field, { signature: 'x', value: '李明' })).toBe('filled');
    expect((field.element as HTMLInputElement).value).toBe('李明');
    expect(events).toEqual(['input', 'change']);
  });

  it('never overwrites a field that already has a value', () => {
    const field = fieldFor('<label>姓名<input name="n" value="已填"></label>');
    expect(applyFill(field, { signature: 'x', value: '李明' })).toBe('skipped');
    expect((field.element as HTMLInputElement).value).toBe('已填');
  });

  it('selects a native option and treats a placeholder selection as empty', () => {
    const field = fieldFor('<label>学历<select name="d"><option value="">请选择</option><option value="2">硕士</option></select></label>');
    expect(applyFill(field, { signature: 'x', value: '2' })).toBe('filled');
    expect((field.element as HTMLSelectElement).value).toBe('2');
  });

  it('clicks the matching radio in the group', () => {
    const field = fieldFor('<div><span>性别</span><label><input type="radio" name="s" value="m">男</label><label><input type="radio" name="s" value="f">女</label></div>');
    expect(applyFill(field, { signature: 'x', value: 'f' })).toBe('filled');
    expect((document.querySelector('input[value="f"]') as HTMLInputElement).checked).toBe(true);
    expect(applyFill(field, { signature: 'x', value: 'm' })).toBe('skipped');
  });

  it('attaches the resume file via DataTransfer and rejects bad base64', () => {
    const field = fieldFor('<label>上传简历<input type="file" name="cv"></label>');
    const added: File[] = [];
    const fakeFiles = { length: 1 } as unknown as FileList;
    const makeDataTransfer = () => ({ items: { add: (f: File) => added.push(f) }, files: fakeFiles }) as unknown as DataTransfer;
    const setFiles = vi.fn();
    let current: FileList | null = null;
    Object.defineProperty(field.element, 'files', {
      get: () => current,
      set: (value: FileList) => { setFiles(value); current = value; },
      configurable: true,
    });
    const file = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(applyFill(field, { signature: 'x', file }, { makeDataTransfer })).toBe('filled');
    expect(added[0]?.name).toBe('cv.pdf');
    expect(setFiles).toHaveBeenCalledWith(fakeFiles);
    const bad = { ...file, dataBase64: '@@@' };
    const field2 = fieldFor('<label>上传简历<input type="file" name="cv"></label>');
    expect(applyFill(field2, { signature: 'x', file: bad }, { makeDataTransfer })).toBe('failed');
  });

  it('treats a default real option as a user choice (C3)', () => {
    const field = fieldFor('<label>国家<select name="c"><option value="cn">中国</option><option value="uk">英国</option></select></label>');
    expect(applyFill(field, { signature: 'x', value: 'uk' })).toBe('skipped');
    expect((field.element as HTMLSelectElement).value).toBe('cn');
  });

  it('treats a placeholder-text or disabled first option as empty (C3)', () => {
    const a = fieldFor('<label>国家<select name="c"><option value="0">-- 请选择 --</option><option value="uk">英国</option></select></label>');
    expect(applyFill(a, { signature: 'x', value: 'uk' })).toBe('filled');
    const b = fieldFor('<label>国家<select name="c"><option value="0" disabled selected>Pick one</option><option value="uk">英国</option></select></label>');
    expect(applyFill(b, { signature: 'x', value: 'uk' })).toBe('filled');
  });

  it('fills a radio group only inside its own form (C4)', () => {
    document.body.innerHTML = `
      <form><span>性别</span><label><input type="radio" name="sex" value="m">男</label><label><input type="radio" name="sex" value="f">女</label></form>
      <form><span>性别</span><label><input type="radio" name="sex" value="m">男</label><label><input type="radio" name="sex" value="f">女</label></form>`;
    const [first, second] = scanFields(document);
    if (!first || !second) throw new Error('expected two groups');
    expect(applyFill(first, { signature: 'x', value: 'f' })).toBe('filled');
    const forms = document.querySelectorAll('form');
    expect(forms[1]?.querySelector<HTMLInputElement>('input:checked')).toBeNull();
    expect(applyFill(second, { signature: 'y', value: 'm' })).toBe('filled');
  });

  it('reports failed when a date or number input rejects the value (C6)', () => {
    const date = fieldFor('<label>开始时间<input type="date" name="d"></label>');
    expect(applyFill(date, { signature: 'x', value: '2025/09' })).toBe('failed');
    const ok = fieldFor('<label>开始时间<input type="date" name="d"></label>');
    expect(applyFill(ok, { signature: 'x', value: '2025-09-01' })).toBe('filled');
    const num = fieldFor('<label>年龄<input type="number" name="n"></label>');
    expect(applyFill(num, { signature: 'x', value: 'abc' })).toBe('failed');
  });

  it('returns failed when the instruction does not fit the element', () => {
    const field = fieldFor('<label>姓名<input name="n"></label>');
    expect(applyFill(field, { signature: 'x' })).toBe('failed');
  });
});

describe('markField', () => {
  it('outlines filled and unfilled fields distinctly', () => {
    document.body.innerHTML = '<input id="a"><input id="b">';
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    markField(a, 'filled');
    markField(b, 'unfilled');
    expect(a.dataset.resumesub).toBe('filled');
    expect(b.dataset.resumesub).toBe('unfilled');
    expect(a.style.getPropertyValue('outline')).not.toBe(b.style.getPropertyValue('outline'));
  });
});
