// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
});

const ANT_SELECT = `
  <div class="ant-form-item"><div class="ant-form-item-label"><label>学历</label></div>
    <div class="ant-form-item-control"><div class="ant-select"><div class="ant-select-selector">
      <span class="ant-select-selection-search"><input role="combobox" class="ant-select-selection-search-input" readonly style="opacity:0"></span>
      <span class="ant-select-selection-placeholder">请选择</span>
    </div></div></div></div>`;

const EL_SELECT = `
  <div class="el-form-item"><label class="el-form-item__label">政治面貌</label>
    <div class="el-form-item__content"><div class="el-select"><div class="el-input"><input class="el-input__inner" readonly placeholder="请选择"></div></div></div></div>`;

const ARIA_BUTTON = `<div><span id="lb">Degree</span><button type="button" aria-haspopup="listbox" aria-labelledby="lb">Select One</button></div>`;

const ANT_RANGE = `
  <div class="ant-form-item"><div class="ant-form-item-label"><label>在校时间</label></div>
    <div class="ant-picker ant-picker-range">
      <div class="ant-picker-input"><input placeholder="开始日期"></div>
      <div class="ant-picker-input"><input placeholder="结束日期"></div>
    </div></div>`;

const EL_DATE = `
  <div class="el-form-item"><label class="el-form-item__label">出生日期</label>
    <div class="el-date-editor el-input"><input class="el-input__inner" readonly placeholder="选择日期"></div></div>`;

describe('widget scanning', () => {
  it('reports one combobox field per Ant/Element/ARIA select using the form-item label', () => {
    document.body.innerHTML = ANT_SELECT + EL_SELECT + ARIA_BUTTON;
    const fields = scanFields(document);
    expect(fields.map((f) => [f.descriptor.kind, f.descriptor.label])).toEqual([
      ['combobox', '学历'], ['combobox', '政治面貌'], ['combobox', 'Degree'],
    ]);
    expect(fields[0]?.element.classList.contains('ant-select')).toBe(true);
    expect(fields[1]?.element.classList.contains('el-select')).toBe(true);
    expect(fields[2]?.element.tagName).toBe('BUTTON');
  });

  it('reports date pickers (including readonly ones) and labels range halves with their placeholder', () => {
    document.body.innerHTML = ANT_RANGE + EL_DATE;
    const fields = scanFields(document);
    expect(fields.map((f) => [f.descriptor.kind, f.descriptor.label])).toEqual([
      ['datepicker', '在校时间 开始日期'], ['datepicker', '在校时间 结束日期'], ['datepicker', '出生日期'],
    ]);
  });

  it('still skips ordinary readonly inputs', () => {
    document.body.innerHTML = '<label>只读<input readonly name="r"></label>';
    expect(scanFields(document)).toEqual([]);
  });
});
