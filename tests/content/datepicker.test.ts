// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { fillDatePicker } from '@/content/datepicker';

afterEach(() => {
  document.body.innerHTML = '';
});

const ctx = () => ({ doc: document, wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), timeoutMs: 300 });

it('types the value, presses Enter and keeps it', async () => {
  document.body.innerHTML = '<div class="ant-picker"><input placeholder="请选择月份"></div>';
  const input = document.querySelector('input') as HTMLInputElement;
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
