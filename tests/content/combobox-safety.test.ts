// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { fillCombobox } from '@/content/combobox';

afterEach(() => {
  document.body.innerHTML = '';
});

const ctx = () => ({ doc: document, wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), timeoutMs: 200 });

function dropdownWith(options: readonly string[], onPick: (text: string) => void): HTMLElement {
  const dd = document.createElement('div');
  dd.className = 'ant-select-dropdown';
  for (const text of options) {
    const item = document.createElement('div');
    item.className = 'ant-select-item ant-select-item-option';
    item.textContent = text;
    item.addEventListener('click', () => onPick(text));
    dd.appendChild(item);
  }
  return dd;
}

function antSelect(id: string): { root: HTMLElement; selector: HTMLElement } {
  document.body.insertAdjacentHTML('beforeend', `<div class="ant-select" id="${id}"><div class="ant-select-selector"><span class="ant-select-selection-placeholder">请选择</span></div></div>`);
  const root = document.getElementById(id) as HTMLElement;
  return { root, selector: root.querySelector('.ant-select-selector') as HTMLElement };
}

const choose = (selector: HTMLElement, text: string) => {
  selector.innerHTML = `<span class="ant-select-selection-item">${text}</span>`;
};

describe('dropdown selection (C1)', () => {
  it('never uses a stale visible dropdown that belongs to another select', async () => {
    const stalePicks: string[] = [];
    document.body.appendChild(dropdownWith(['本科', '硕士'], (t) => stalePicks.push(t)));
    const { root } = antSelect('mine'); // 点击后不展开任何下拉层
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('failed');
    expect(stalePicks).toEqual([]);
  });

  it('accepts a dropdown anchored through aria-controls even if it was already visible', async () => {
    document.body.innerHTML = `<div class="ant-select" id="r"><div class="ant-select-selector"><input role="combobox" aria-controls="r_list" readonly></div></div>`;
    const root = document.getElementById('r') as HTMLElement;
    const selector = root.querySelector('.ant-select-selector') as HTMLElement;
    const dd = dropdownWith(['本科', '硕士'], (t) => choose(selector, t));
    dd.insertAdjacentHTML('afterbegin', '<div role="listbox" id="r_list"></div>');
    document.body.appendChild(dd);
    expect(await fillCombobox(root, { signature: 's', value: '本科' }, ctx())).toBe('filled');
  });
});

describe('closing (C2)', () => {
  it('waits for an animated dropdown to hide after Escape before clicking the opener again', async () => {
    const { root, selector } = antSelect('a');
    let toggles = 0;
    const dd = dropdownWith(['党员'], () => {});
    selector.addEventListener('mousedown', () => {
      toggles += 1;
      if (!dd.isConnected) document.body.appendChild(dd);
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setTimeout(() => dd.classList.add('ant-select-dropdown-hidden'), 120);
    });
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('failed');
    expect(toggles).toBe(1);
    expect(dd.classList.contains('ant-select-dropdown-hidden')).toBe(true);
  });

  it('does not press Escape when no dropdown is visible', async () => {
    const { root } = antSelect('b');
    const keys: string[] = [];
    document.addEventListener('keydown', (e) => keys.push(e.key));
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('failed');
    expect(keys).not.toContain('Escape');
  });

  it('closes the dropdown when the option click does not take', async () => {
    const { root, selector } = antSelect('c');
    const dd = dropdownWith(['硕士'], () => {}); // 点击选项没有效果
    selector.addEventListener('mousedown', () => document.body.appendChild(dd));
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dd.classList.add('ant-select-dropdown-hidden');
    });
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('failed');
    expect(dd.classList.contains('ant-select-dropdown-hidden')).toBe(true);
  });
});

describe('virtual lists (C7)', () => {
  const ALL = ['北京大学（医学部）', '北京交通大学', '清华大学', '复旦大学', '南京大学', '浙江大学', '北京大学', '武汉大学'];
  const WINDOW = 3;
  const ROW = 32;

  function virtualSelect(all: readonly string[] = ALL): HTMLElement {
    const { root, selector } = antSelect('v');
    const dd = document.createElement('div');
    dd.className = 'ant-select-dropdown';
    dd.innerHTML = '<div class="rc-virtual-list"><div class="rc-virtual-list-holder"><div class="inner"></div></div></div>';
    const holder = dd.querySelector('.rc-virtual-list-holder') as HTMLElement;
    const render = () => {
      const start = Math.min(Math.floor(holder.scrollTop / ROW), all.length - WINDOW);
      const inner = holder.querySelector('.inner') as HTMLElement;
      inner.replaceChildren(...all.slice(start, start + WINDOW).map((text) => {
        const item = document.createElement('div');
        item.className = 'ant-select-item ant-select-item-option';
        item.textContent = text;
        item.addEventListener('click', () => choose(selector, text));
        return item;
      }));
    };
    holder.addEventListener('scroll', render);
    selector.addEventListener('mousedown', () => {
      render();
      document.body.appendChild(dd);
    });
    return root;
  }

  it('scrolls a virtual list to find an exact match instead of a bracketed loose one', async () => {
    const root = virtualSelect();
    expect(await fillCombobox(root, { signature: 's', value: '北京大学' }, ctx())).toBe('filled');
    expect(root.textContent).toBe('北京大学');
  });

  it('does not accept a bracket-qualified loose match from a partial window', async () => {
    const root = virtualSelect(ALL.filter((t) => t !== '北京大学'));
    expect(await fillCombobox(root, { signature: 's', value: '北京大学' }, ctx())).toBe('failed');
  });
});
