// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fnv1a } from '@/content/signature';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rect = (left: number, top: number, width: number, height: number) =>
  ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

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

  it('computes repeatIndex from repeated sibling blocks (B3)', () => {
    const fields = mount(`
      <div class="row"><label>最高学历<input name="top"></label></div>
      <div class="row"><label>邮箱<input name="mail"></label></div>
      <section><h3>教育经历</h3>
        <div class="edu-item"><div class="row"><label>学校<input name="s"></label></div><div class="row"><label>专业<input name="m"></label></div></div>
        <div class="edu-item"><div class="row"><label>学校<input name="s"></label></div><div class="row"><label>专业<input name="m"></label></div></div>
      </section>
    `);
    expect(fields.map((f) => [f.descriptor.name, f.descriptor.repeatIndex])).toEqual([
      ['top', 0], ['mail', 0], ['s', 0], ['m', 0], ['s', 1], ['m', 1],
    ]);
    expect(fields[2]?.descriptor.signature).not.toBe(fields[4]?.descriptor.signature);
  });

  it('does not treat differently shaped sibling sections as repeats', () => {
    const fields = mount(`
      <div class="sec"><h3>基本信息</h3><label>姓名<input name="n"></label></div>
      <div class="sec"><h3>教育经历</h3><label>学校<input name="s"></label><label>专业<input name="m"></label></div>
    `);
    expect(fields.map((f) => f.descriptor.repeatIndex)).toEqual([0, 0, 0]);
  });

  it('skips transparent controls (C1)', () => {
    const fields = mount('<label>姓名<input name="o" style="opacity:0"></label><label>邮箱<input name="ok"></label>');
    expect(fields.map((f) => f.descriptor.name)).toEqual(['ok']);
  });

  it('skips zero-size and off-screen controls when layout is available (C1)', () => {
    document.body.innerHTML = '<input name="off"><input name="tiny"><input name="ok">';
    vi.spyOn(document.documentElement, 'getBoundingClientRect').mockReturnValue(rect(0, 0, 1024, 768));
    const byName = (n: string) => document.querySelector(`[name="${n}"]`) as HTMLElement;
    vi.spyOn(byName('off'), 'getBoundingClientRect').mockReturnValue(rect(-9999, 10, 200, 20));
    vi.spyOn(byName('tiny'), 'getBoundingClientRect').mockReturnValue(rect(10, 10, 0, 0));
    vi.spyOn(byName('ok'), 'getBoundingClientRect').mockReturnValue(rect(10, 40, 200, 20));
    expect(scanFields(document).map((f) => f.descriptor.name)).toEqual(['ok']);
  });

  it('keeps hidden file inputs only behind a visible label or upload button (C1)', () => {
    const fields = mount(`
      <input type="file" name="orphan" style="display:none">
      <label style="display:none">上传简历<input type="file" name="hiddenLabel" style="display:none"></label>
      <label>上传简历<input type="file" name="inLabel" style="display:none"></label>
      <label for="cv2">上传简历</label><input type="file" id="cv2" name="forLabel" hidden>
      <span role="button">上传简历<input type="file" name="inButton" style="display:none"></span>
    `);
    expect(fields.map((f) => f.descriptor.name)).toEqual(['inLabel', 'forLabel', 'inButton']);
  });

  it('caps fields at 300 and options at 200 (C2)', () => {
    const many = Array.from({ length: 305 }, (_, i) => `<label>字段${i}<input name="f${i}"></label>`).join('');
    expect(mount(many)).toHaveLength(300);
    const options = Array.from({ length: 250 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
    const [select] = mount(`<label>国家<select name="c">${options}</select></label>`);
    expect(select?.descriptor.options).toHaveLength(200);
  });

  it('keys radio groups by form and name (C4)', () => {
    const fields = mount(`
      <form><span>性别</span><label><input type="radio" name="sex" value="m">男</label><label><input type="radio" name="sex" value="f">女</label></form>
      <form><span>性别</span><label><input type="radio" name="sex" value="m">男</label><label><input type="radio" name="sex" value="f">女</label></form>
    `);
    expect(fields).toHaveLength(2);
    expect(fields.map((f) => f.descriptor.options?.length)).toEqual([2, 2]);
  });

  it('finds radio group labels in Ant-style, aria and fieldset markup (C5)', () => {
    const fields = mount(`
      <div class="form-item"><label>性别</label><div class="radio-group">
        <label><input type="radio" name="g" value="m">男</label><label><input type="radio" name="g" value="f">女</label>
      </div></div>
      <div role="radiogroup" aria-label="Gender"><label><input type="radio" name="a" value="m">M</label><label><input type="radio" name="a" value="f">F</label></div>
      <span id="lbl">Willing to relocate</span>
      <div role="radiogroup" aria-labelledby="lbl"><label><input type="radio" name="r" value="y">Yes</label><label><input type="radio" name="r" value="n">No</label></div>
      <fieldset><legend>Sex</legend><div><label><input type="radio" name="x" value="m">M</label></div><div><label><input type="radio" name="x" value="f">F</label></div></fieldset>
    `);
    expect(fields.map((f) => f.descriptor.label)).toEqual(['性别', 'Gender', 'Willing to relocate', 'Sex']);
  });

  it('fnv1a is stable', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});
