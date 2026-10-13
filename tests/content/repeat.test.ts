// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
});

const block = (suffix: string, extra = '') =>
  `<div class="edu-item"><div class="row"><span>学校名称</span><input name="school_${suffix}"></div>` +
  `<div class="row"><span>专业</span><input name="major_${suffix}"></div>${extra}</div>`;

const indices = () => scanFields(document).map((f) => [f.descriptor.name || f.descriptor.placeholder, f.descriptor.repeatIndex]);

describe('repeatIndexOf (R1)', () => {
  it('a) indexes the controller E2E markup by block, not by row', () => {
    document.body.innerHTML = `<div id="edus">${block('a')}${block('b')}</div>`;
    expect(indices()).toEqual([['school_a', 0], ['major_a', 0], ['school_b', 1], ['major_b', 1]]);
  });

  it('b) gives a dynamically appended third block index 2', () => {
    document.body.innerHTML = `<div id="edus">${block('a')}${block('b')}</div>`;
    document.getElementById('edus')?.insertAdjacentHTML('beforeend', block('c'));
    expect(indices().slice(4)).toEqual([['school_c', 2], ['major_c', 2]]);
  });

  it('c) does not treat RangePicker inputs as repeated blocks', () => {
    const picker = '<div class="row"><span>在校时间</span><div class="ant-picker">' +
      '<div class="ant-picker-input"><input placeholder="开始日期"></div>' +
      '<div class="ant-picker-input"><input placeholder="结束日期"></div></div></div>';
    document.body.innerHTML = `<div id="edus">${block('a', picker)}${block('b')}</div>`;
    expect(indices()).toEqual([
      ['school_a', 0], ['major_a', 0], ['开始日期', 0], ['结束日期', 0], ['school_b', 1], ['major_b', 1],
    ]);
  });

  it('d) ignores delete buttons and validation text that only some blocks show', () => {
    document.body.innerHTML = `<div id="edus">${block('a', '<span class="error">必填</span>')}` +
      `${block('b', '<button type="button">删除</button>')}</div>`;
    expect(indices()).toEqual([['school_a', 0], ['major_a', 0], ['school_b', 1], ['major_b', 1]]);
  });

  it('e) skips hidden template blocks', () => {
    const hiddenStyle = block('t').replace('class="edu-item"', 'class="edu-item" style="display:none"');
    const hiddenAttr = block('u').replace('class="edu-item"', 'class="edu-item" hidden');
    document.body.innerHTML = `<div id="edus">${hiddenStyle}${hiddenAttr}${block('a')}${block('b')}</div>`;
    expect(indices()).toEqual([['school_a', 0], ['major_a', 0], ['school_b', 1], ['major_b', 1]]);
  });

  it('e2) ignores unstable state classes on blocks', () => {
    document.body.innerHTML = `<div id="edus">${block('a').replace('edu-item', 'edu-item is-active has-error')}${block('b')}</div>`;
    expect(indices()).toEqual([['school_a', 0], ['major_a', 0], ['school_b', 1], ['major_b', 1]]);
  });

  it('e3) matches by normalized name when blocks use indexed names', () => {
    const item = (i: number) => `<div class="exp"><input name="exp[${i}].company"><input name="exp[${i}].title"></div>`;
    document.body.innerHTML = `<section>${item(0)}${item(1)}</section>`;
    expect(indices().map(([, index]) => index)).toEqual([0, 0, 1, 1]);
  });

  it('f) leaves a top-level single field at 0', () => {
    document.body.innerHTML = '<label>姓名<input name="name"></label>';
    expect(indices()).toEqual([['name', 0]]);
  });
});
