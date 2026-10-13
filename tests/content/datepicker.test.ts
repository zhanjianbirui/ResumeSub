// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { fillDatePicker } from '@/content/datepicker';

afterEach(() => {
  document.body.innerHTML = '';
});

const ctx = () => ({ doc: document, wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), timeoutMs: 300 });

it('types the value, presses Enter while the panel is open and keeps it', async () => {
  document.body.innerHTML = '<div class="ant-picker"><input placeholder="请选择月份"></div><div class="ant-picker-dropdown ant-picker-dropdown-hidden"><div class="ant-picker-panel">9月</div></div>';
  const input = document.querySelector('input') as HTMLInputElement;
  const panel = document.querySelector('.ant-picker-dropdown') as HTMLElement;
  input.addEventListener('focus', () => panel.classList.remove('ant-picker-dropdown-hidden'));
  input.addEventListener('blur', () => panel.classList.add('ant-picker-dropdown-hidden'));
  const events: string[] = [];
  ['input', 'keydown', 'change'].forEach((t) => input.addEventListener(t, () => events.push(t)));
  expect(await fillDatePicker(input, '2025-09', ctx())).toBe('filled');
  expect(input.value).toBe('2025-09');
  expect(events).toEqual(expect.arrayContaining(['input', 'keydown', 'change']));
});

it('reports failure when the widget rejects typed input', async () => {
  document.body.innerHTML = '<div class="el-date-editor"><input readonly></div>';
  const input = document.querySelector('input') as HTMLInputElement;
  input.addEventListener('change', () => { input.value = ''; });
  expect(await fillDatePicker(input, '2025-09', ctx())).toBe('failed');
});

it('skips a picker that already has a value', async () => {
  document.body.innerHTML = '<div class="ant-picker"><input value="2020-01"></div>';
  expect(await fillDatePicker(document.querySelector('input') as HTMLInputElement, '2025-09', ctx())).toBe('skipped');
});

it('does not send Enter or Escape when no picker panel is open, and restores focus', async () => {
  document.body.innerHTML = '<input id="before"><div class="el-date-editor"><input id="d"></div>';
  const previous = document.getElementById('before') as HTMLInputElement;
  previous.focus();
  const keys: string[] = [];
  document.addEventListener('keydown', (e) => keys.push(e.key));
  const input = document.getElementById('d') as HTMLInputElement;
  expect(await fillDatePicker(input, '2025-09', ctx())).toBe('filled');
  expect(keys).toEqual([]);
  expect(document.activeElement).toBe(previous);
});

it('closes a panel that is still open after blur with Escape', async () => {
  document.body.innerHTML = '<div class="el-date-editor"><input id="d"></div><div class="el-picker__popper" style="display:none"><div class="el-picker-panel">x</div></div>';
  const popper = document.querySelector('.el-picker__popper') as HTMLElement;
  const input = document.getElementById('d') as HTMLInputElement;
  input.addEventListener('focus', () => { popper.style.display = ''; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') popper.style.display = 'none'; });
  expect(await fillDatePicker(input, '2025-09', ctx())).toBe('filled');
  expect(popper.style.display).toBe('none');
});

it('re-reads the value after blur and reports failure when the widget clears it late', async () => {
  document.body.innerHTML = '<div class="ant-picker"><input></div>';
  const input = document.querySelector('input') as HTMLInputElement;
  input.addEventListener('blur', () => setTimeout(() => { input.value = ''; }, 50));
  expect(await fillDatePicker(input, 'garbage', ctx())).toBe('failed');
});
