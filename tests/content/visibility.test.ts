// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFileReachable, isVisible } from '@/content/visibility';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

function setScroll(x: number, y: number) {
  Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

afterEach(() => {
  document.body.innerHTML = '';
  setScroll(0, 0);
  vi.restoreAllMocks();
});

function input(r: DOMRect): HTMLInputElement {
  document.body.innerHTML = '<input name="x">';
  const el = document.querySelector('input') as HTMLInputElement;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(r);
  return el;
}

describe('isVisible off-screen check (R2)', () => {
  it('treats a control scrolled above the viewport as visible', () => {
    const el = input(rect(10, -500, 190, 20));
    setScroll(0, 1000);
    expect(isVisible(el, true)).toBe(true);
  });

  it('hides the same rect when the page is not scrolled', () => {
    const el = input(rect(10, -500, 190, 20));
    expect(isVisible(el, true)).toBe(false);
  });

  it('hides controls pushed far to the left', () => {
    const el = input(rect(-9999, 10, 200, 20));
    expect(isVisible(el, true)).toBe(false);
  });
});

describe('isFileReachable (R3)', () => {
  it('does not treat a hidden file input in an upload-classed div as reachable', () => {
    document.body.innerHTML = '<div class="upload-form"><span>上传</span><input type="file" style="display:none"></div>';
    expect(isFileReachable(document.querySelector('input') as HTMLInputElement, false)).toBe(false);
  });

  it('accepts a visible button-like direct parent and a wrapping label', () => {
    document.body.innerHTML = '<button>上传<input type="file" name="a" style="display:none"></button>' +
      '<label><span>简历<input type="file" name="b" style="display:none"></span></label>' +
      '<div role="button"><div><input type="file" name="c" style="display:none"></div></div>';
    const get = (n: string) => document.querySelector(`[name="${n}"]`) as HTMLInputElement;
    expect([isFileReachable(get('a'), false), isFileReachable(get('b'), false), isFileReachable(get('c'), false)])
      .toEqual([true, true, false]);
  });
});
