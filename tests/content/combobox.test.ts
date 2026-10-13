// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { fillCombobox } from '@/content/combobox';

afterEach(() => {
  document.body.innerHTML = '';
});

const ctx = () => ({ doc: document, wait: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), timeoutMs: 300 });

function mountAntSelect(options: string[], selected?: string) {
  document.body.innerHTML = `
    <div class="ant-select"><div class="ant-select-selector">
      ${selected ? `<span class="ant-select-selection-item">${selected}</span>` : '<span class="ant-select-selection-placeholder">请选择</span>'}
    </div></div>`;
  const root = document.querySelector('.ant-select') as HTMLElement;
  const selector = root.querySelector('.ant-select-selector') as HTMLElement;
  selector.addEventListener('mousedown', () => {
    // 组件在下一个宏任务才渲染下拉层，模拟异步
    setTimeout(() => {
      const dd = document.createElement('div');
      dd.className = 'ant-select-dropdown';
      for (const text of options) {
        const item = document.createElement('div');
        item.className = 'ant-select-item ant-select-item-option';
        item.textContent = text;
        item.addEventListener('click', () => {
          selector.innerHTML = `<span class="ant-select-selection-item">${text}</span>`;
          dd.remove();
        });
        dd.appendChild(item);
      }
      document.body.appendChild(dd);
    }, 20);
  });
  return root;
}

describe('fillCombobox', () => {
  it('opens the dropdown, waits for options, and clicks the best match', async () => {
    const root = mountAntSelect(['本科', '硕士研究生', '博士研究生']);
    const outcome = await fillCombobox(root, { signature: 's', value: '硕士', candidates: ['硕士', 'master'] }, ctx());
    expect(outcome).toBe('filled');
    expect(root.querySelector('.ant-select-selection-item')?.textContent).toBe('硕士研究生');
    expect(document.querySelector('.ant-select-dropdown')).toBeNull();
  });

  it('skips a select that already has a selection', async () => {
    const root = mountAntSelect(['本科'], '本科');
    expect(await fillCombobox(root, { signature: 's', value: '硕士', candidates: ['硕士'] }, ctx())).toBe('skipped');
  });

  it('fails and closes with Escape when no option matches or none appear', async () => {
    const root = mountAntSelect(['党员', '群众']);
    const keys: string[] = [];
    document.addEventListener('keydown', (e) => keys.push(e.key));
    expect(await fillCombobox(root, { signature: 's', value: '硕士', candidates: ['硕士'] }, ctx())).toBe('failed');
    expect(keys).toContain('Escape');
    document.body.innerHTML = '<div class="ant-select"><div class="ant-select-selector"></div></div>';
    const empty = document.querySelector('.ant-select') as HTMLElement;
    expect(await fillCombobox(empty, { signature: 's', value: '硕士', candidates: ['硕士'] }, ctx())).toBe('failed');
  });

  it('uses aria-controls listbox for ARIA comboboxes', async () => {
    document.body.innerHTML = `
      <button type="button" aria-haspopup="listbox" aria-controls="lst">Select One</button>
      <ul id="lst" role="listbox" hidden><li role="option">Bachelor's Degree</li><li role="option">Master's Degree</li></ul>`;
    const button = document.querySelector('button') as HTMLElement;
    const list = document.getElementById('lst') as HTMLElement;
    button.addEventListener('click', () => { list.hidden = false; });
    list.querySelectorAll('li').forEach((li) => li.addEventListener('click', () => {
      button.textContent = li.textContent;
      list.hidden = true;
    }));
    expect(await fillCombobox(button, { signature: 's', value: 'Master', candidates: ['Master', "master's", 'msc'] }, ctx())).toBe('filled');
    expect(button.textContent).toBe("Master's Degree");
  });

  it('fails without opening when there is nothing to match', async () => {
    const root = mountAntSelect(['本科']);
    expect(await fillCombobox(root, { signature: 's' }, ctx())).toBe('failed');
  });

  it('picks options from the newly opened Element Plus popper, not stale hidden ones', async () => {
    document.body.innerHTML = `
      <div class="el-select"><div class="el-select__wrapper"><div class="el-select__selection">
        <div class="el-select__selected-item el-select__placeholder is-transparent"><span>请选择</span></div>
        <input class="el-select__input" role="combobox"></div></div></div>
      <div class="el-popper el-select__popper" style="display:none"><div class="el-select-dropdown"><ul>
        <li class="el-select-dropdown__item">硕士</li></ul></div></div>
      <div class="el-popper el-select__popper" id="mine" style="display:none"><div class="el-select-dropdown"><ul>
        <li class="el-select-dropdown__item">本科</li><li class="el-select-dropdown__item">硕士</li></ul></div></div>`;
    const root = document.querySelector('.el-select') as HTMLElement;
    const popper = document.getElementById('mine') as HTMLElement;
    const placeholder = root.querySelector('.el-select__placeholder') as HTMLElement;
    const picked: string[] = [];
    root.querySelector('.el-select__wrapper')?.addEventListener('click', () => { popper.style.display = ''; });
    document.querySelectorAll('.el-select-dropdown__item').forEach((li) => li.addEventListener('click', () => {
      picked.push(li.closest('.el-popper')?.id ?? 'stale');
      placeholder.classList.remove('is-transparent');
      placeholder.innerHTML = `<span>${li.textContent}</span>`;
      popper.style.display = 'none';
    }));
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('filled');
    expect(picked).toEqual(['mine']);
    expect(await fillCombobox(root, { signature: 's', value: '本科' }, ctx())).toBe('skipped');
  });

  it('closes a dropdown that ignores Escape by toggling the opener again', async () => {
    document.body.innerHTML = `
      <div class="el-select"><div class="el-select__wrapper"><input class="el-select__input"></div></div>
      <div class="el-popper" style="display:none"><div class="el-select-dropdown"><ul>
        <li class="el-select-dropdown__item">党员</li></ul></div></div>`;
    const root = document.querySelector('.el-select') as HTMLElement;
    const popper = document.querySelector('.el-popper') as HTMLElement;
    root.querySelector('.el-select__wrapper')?.addEventListener('click', () => {
      popper.style.display = popper.style.display === 'none' ? '' : 'none';
    });
    expect(await fillCombobox(root, { signature: 's', value: '硕士' }, ctx())).toBe('failed');
    expect(popper.style.display).toBe('none');
  });
});
