// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { activeAdapter, type SiteAdapter } from '@/content/adapters';
import { resolveLabel } from '@/content/label';
import { scanFields } from '@/content/scan';

afterEach(() => {
  document.body.innerHTML = '';
});

const kinds = () => scanFields(document).map((f) => [f.descriptor.kind, f.descriptor.label]);

describe('date picker detection (A1)', () => {
  it('does not treat class substrings or non-text inputs as date pickers', () => {
    document.body.innerHTML = '<form class="datepicker-form"><label>同意<input type="checkbox"></label><label>备注<input name="x"></label></form>';
    expect(kinds()).toEqual([['text', '备注']]);
  });

  it('accepts exact datepicker class tokens with text-like inputs only', () => {
    document.body.innerHTML = `
      <div class="date-picker"><label>开始<input type="text"></label></div>
      <div class="datepicker"><label>结束<input type="number"></label></div>`;
    expect(kinds()).toEqual([['datepicker', '开始'], ['number', '结束']]);
  });

  it('does not report inputs inside an open Element date panel', () => {
    document.body.innerHTML = `
      <div class="el-picker-panel el-date-picker"><div class="el-date-editor"><input placeholder="选择时间" aria-label="时间"></div>
        <span class="el-date-picker__header-label">2025</span><input placeholder="日期" aria-label="日期"></div>`;
    expect(scanFields(document)).toEqual([]);
  });
});

describe('form-item labels (A2)', () => {
  it('uses the placeholder for the second input when the plain label targets the first', () => {
    document.body.innerHTML = '<div class="form-item"><label for="a">姓</label><input id="a"><input id="b" placeholder="名"></div>';
    expect(resolveLabel(document.getElementById('b') as HTMLElement)).toBe('名');
    expect(resolveLabel(document.getElementById('a') as HTMLElement)).toBe('姓');
  });

  it('prefers the framework label over another plain label in the item', () => {
    document.body.innerHTML = `<div class="el-form-item"><label class="hint">提示 <input id="z" type="checkbox"></label>
      <label class="el-form-item__label">学校</label><div class="el-select"><input id="x" readonly></div></div>`;
    expect(resolveLabel(document.getElementById('x') as HTMLElement)).toBe('学校');
  });

  it('strips control text from the form-item label', () => {
    document.body.innerHTML = '<div class="ant-form-item"><div class="ant-form-item-label"><label>城市<select><option>北京</option></select></label></div><div class="ant-select" id="s"></div></div>';
    expect(resolveLabel(document.getElementById('s') as HTMLElement)).toBe('城市');
  });
});

describe('disabled widgets (A3)', () => {
  it('skips disabled custom selects and date pickers', () => {
    document.body.innerHTML = `
      <div class="ant-form-item"><div class="ant-form-item-label"><label>A</label></div><div class="ant-select ant-select-disabled"><input role="combobox" readonly></div></div>
      <div class="el-form-item"><label class="el-form-item__label">B</label><div class="el-select is-disabled"><input class="el-input__inner" readonly></div></div>
      <div class="form-item"><label>C</label><div class="ant-select"><input role="combobox" disabled></div></div>
      <div class="form-item"><label>D</label><button type="button" aria-haspopup="listbox" aria-disabled="true">Select</button></div>
      <div class="form-item"><label>E</label><div class="ant-picker ant-picker-disabled"><input></div></div>
      <div class="form-item"><label>F</label><div class="el-date-editor is-disabled"><input></div></div>
      <div class="form-item"><label>G</label><div class="ant-select"><input role="combobox" readonly></div></div>`;
    expect(kinds()).toEqual([['combobox', 'G']]);
  });
});

describe('ARIA wrappers (A4)', () => {
  it('reports an ARIA 1.0 combobox wrapper once, not its inner text input', () => {
    document.body.innerHTML = '<label id="l">国家</label><div role="combobox" aria-labelledby="l" aria-expanded="false"><input type="text"></div>';
    expect(kinds()).toEqual([['combobox', '国家']]);
  });

  it('reports a MUI-style select once and ignores its aria-hidden native input', () => {
    document.body.innerHTML = `<div class="MuiFormControl"><label id="m">学历</label>
      <div role="combobox" aria-labelledby="m" aria-haspopup="listbox">请选择</div>
      <input aria-hidden="true" tabindex="-1" class="MuiSelect-nativeInput" value=""></div>`;
    expect(kinds()).toEqual([['combobox', '学历']]);
  });
});

describe('adapters and dedupe (A6)', () => {
  const adapter: SiteAdapter = { id: 'x', matches: (url) => url.hostname === 'jobs.example' };

  it('activeAdapter matches, misses and tolerates invalid URLs', () => {
    expect(activeAdapter('https://jobs.example/apply', [adapter])).toBe(adapter);
    expect(activeAdapter('https://other.example/', [adapter])).toBeNull();
    expect(activeAdapter('not a url', [adapter])).toBeNull();
    expect(activeAdapter('https://jobs.example/', [])).toBeNull();
  });

  it('reports one field for a select root that contains several inputs', () => {
    document.body.innerHTML = `<div class="ant-form-item"><div class="ant-form-item-label"><label>技能</label></div>
      <div class="ant-select"><input role="combobox" readonly><input class="ant-select-search" readonly></div></div>`;
    expect(kinds()).toEqual([['combobox', '技能']]);
  });

  it('computes repeatIndex from the widget root for repeated custom selects', () => {
    const block = (n: number) => `<div class="edu"><div class="form-item"><label>学校</label><input name="s${n}"></div>
      <div class="ant-form-item"><div class="ant-form-item-label"><label>学历</label></div><div class="ant-select"><input role="combobox" readonly></div></div></div>`;
    document.body.innerHTML = `<section>${block(0)}${block(1)}</section>`;
    const combos = scanFields(document).filter((f) => f.descriptor.kind === 'combobox');
    expect(combos.map((f) => f.descriptor.repeatIndex)).toEqual([0, 1]);
  });

  it('computes repeatIndex for Ant selects whose search input is transparent', () => {
    const select = '<div class="ant-select ant-select-single"><input type="search" role="combobox" readonly style="opacity:0"><span class="ant-select-selection-placeholder">请选择</span></div>';
    const block = (n: number) => `<div class="edu"><div class="form-item"><label>学校</label><input name="s${n}"></div>
      <div class="ant-form-item"><div class="ant-form-item-label"><label>学历</label></div>${select}</div><div class="form-item"><label>专业</label><input name="m${n}"></div></div>`;
    document.body.innerHTML = `<section>${block(0)}${block(1)}</section>`;
    const combos = scanFields(document).filter((f) => f.descriptor.kind === 'combobox');
    expect(combos.map((f) => f.descriptor.repeatIndex)).toEqual([0, 1]);
  });
});
