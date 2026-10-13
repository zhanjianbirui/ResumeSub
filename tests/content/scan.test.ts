// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { fnv1a } from '@/content/signature';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
});

function mount(html: string) {
  document.body.innerHTML = html;
  return scanFields(document);
}

describe('scanFields', () => {
  it('resolves labels from <label for>, wrapping labels, aria and nearby text', () => {
    const fields = mount(`
      <label for="n">姓名</label><input id="n" name="name">
      <label>邮箱 <input type="email" name="mail"></label>
      <input aria-label="手机号" type="tel">
      <div class="item"><span>毕业院校</span><input name="school"></div>
      <input placeholder="请输入专业">
    `);
    expect(fields.map((f) => [f.descriptor.label, f.descriptor.kind])).toEqual([
      ['姓名', 'text'], ['邮箱', 'email'], ['手机号', 'tel'], ['毕业院校', 'text'], ['请输入专业', 'text'],
    ]);
  });

  it('skips hidden, disabled, readonly, password, checkbox and submit controls but keeps hidden file inputs', () => {
    const fields = mount(`
      <input type="hidden" name="h"><input name="d" disabled><input name="r" readonly>
      <input type="password" name="p"><input type="checkbox" name="c"><input type="submit">
      <div style="display:none"><input name="invisible"></div>
      <label>上传简历<input type="file" name="cv" style="display:none"></label>
    `);
    expect(fields.map((f) => f.descriptor.name)).toEqual(['cv']);
    expect(fields[0]?.descriptor.kind).toBe('file');
  });

  it('collects select options and groups radios by name', () => {
    const fields = mount(`
      <label for="deg">学历</label>
      <select id="deg"><option value="">请选择</option><option value="1">本科</option></select>
      <div><span>性别</span>
        <label><input type="radio" name="sex" value="m">男</label>
        <label><input type="radio" name="sex" value="f">女</label>
      </div>
    `);
    expect(fields).toHaveLength(2);
    expect(fields[0]?.descriptor.options).toEqual([{ value: '', label: '请选择' }, { value: '1', label: '本科' }]);
    expect(fields[1]?.descriptor).toMatchObject({
      kind: 'radio', label: '性别', name: 'sex', options: [{ value: 'm', label: '男' }, { value: 'f', label: '女' }],
    });
  });

  it('records the nearest section heading and gives repeated fields distinct signatures', () => {
    const fields = mount(`
      <fieldset><legend>教育经历</legend><label>学校<input name="school"></label></fieldset>
      <section><h3>实习经历</h3><div><label>公司<input name="company"></label></div></section>
      <fieldset><legend>教育经历</legend><label>学校<input name="school"></label></fieldset>
    `);
    expect(fields.map((f) => f.descriptor.section)).toEqual(['教育经历', '实习经历', '教育经历']);
    const [a, , c] = fields.map((f) => f.descriptor.signature);
    expect(a).not.toBe(c);
  });

  it('excludes open-question textareas but keeps description textareas', () => {
    const fields = mount(`
      <label>为什么选择我们公司？<textarea name="why"></textarea></label>
      <label>工作内容<textarea name="desc"></textarea></label>
    `);
    expect(fields.map((f) => f.descriptor.name)).toEqual(['desc']);
    expect(fields[0]?.descriptor.kind).toBe('textarea');
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});
