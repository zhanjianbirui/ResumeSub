// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findAddButton } from '@/content/expand';
import { sectionOf } from '@/content/label';
import { scanFields } from '@/content/scan';
import { startAutofill } from '@/content/start';

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Ant Design 5 Form.Item：控件到 .ant-form-item 之间有 5 层包装。 */
const antItem = (label: string, control: string) => `
  <div class="ant-form-item"><div class="ant-row"><div class="ant-col ant-form-item-label"><label>${label}</label></div>
    <div class="ant-col ant-form-item-control"><div class="ant-form-item-control-input"><div class="ant-form-item-control-input-content">
      ${control}</div></div></div></div></div>`;
const antPicker = '<div class="ant-picker"><div class="ant-picker-input"><input id="pick" placeholder="Select month"></div></div>';

describe('sectionOf on framework DOMs (B1)', () => {
  it('reaches the section heading above a deeply nested Ant month picker', () => {
    document.body.innerHTML = `<form><h3>基本信息</h3>${antItem('姓名', '<input>')}
      <div id="edu-section"><h3>教育经历</h3><div class="edu-item">${antItem('入学时间', antPicker)}</div></div></form>`;
    expect(sectionOf(document.getElementById('pick') as HTMLElement)).toBe('教育经历');
  });

  it('uses the nearest preceding heading among sibling headings (Element form)', () => {
    document.body.innerHTML = `<form class="el-form"><h3>基本信息</h3>
      <div class="el-form-item"><label class="el-form-item__label">姓名</label><div class="el-form-item__content"><input></div></div>
      <h3>教育经历</h3><div class="edu-item"><div class="el-form-item"><label class="el-form-item__label">入学时间</label>
        <div class="el-form-item__content"><div class="el-date-editor el-input"><div class="el-input__wrapper"><input id="start" placeholder="选择月份"></div></div></div></div></div>
      <h3>工作经历</h3></form>`;
    expect(sectionOf(document.getElementById('start') as HTMLElement)).toBe('教育经历');
    const fields = scanFields(document);
    expect(fields.map((f) => [f.descriptor.label, f.descriptor.section])).toEqual([['姓名', '基本信息'], ['入学时间', '教育经历']]);
  });
});

describe('findAddButton on deep framework DOMs (B2)', () => {
  it('finds an Ant Form.List add button placed after a single deeply nested block', () => {
    document.body.innerHTML = `<form><div id="edu-section"><h3>教育经历</h3>
      <div class="edu-item">${antItem('学校名称', '<input id="school">')}${antItem('入学时间', antPicker)}</div>
      <button type="button" id="add" class="ant-btn ant-btn-dashed"><span>+ 添加教育经历</span></button></div></form>`;
    expect(findAddButton(document.getElementById('pick') as HTMLElement, 'education')?.id).toBe('add');
    expect(findAddButton(document.getElementById('school') as HTMLElement, 'education')?.id).toBe('add');
  });

  it('searches above the repeat block when several blocks already exist', () => {
    const block = (n: number) => `<div class="edu-item">${antItem('学校名称', `<input id="s${n}" name="school">`)}${antItem('入学时间', antPicker.replace('id="pick"', ''))}</div>`;
    document.body.innerHTML = `<form><div><div><h3>教育经历</h3>${block(0)}${block(1)}</div>
      <div class="footer"><span><button type="button" id="add">添加</button></span></div></div></form>`;
    expect(findAddButton(document.getElementById('s1') as HTMLElement, 'education')?.id).toBe('add');
  });
});

describe('rescans after the first run changes the page (B3)', () => {
  it('reruns when the first run itself adds a block (e.g. clicks 添加)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const session = {
      run: vi.fn(async () => {
        calls += 1;
        if (calls === 1) document.body.insertAdjacentHTML('beforeend', '<div class="edu-item"><input name="school"></div>');
        return true;
      }),
    };
    const started = startAutofill({ doc: document, session, onRetry: () => {}, getUrl: () => 'https://a.example/' });
    await vi.advanceTimersByTimeAsync(600);
    const stop = await started;
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.run).toHaveBeenCalledTimes(2);
    stop();
  });
});
