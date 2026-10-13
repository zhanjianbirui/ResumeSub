// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { findAddButton, planExpansion } from '@/content/expand';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findAddButton', () => {
  it('finds the nearest add button and ignores delete buttons', () => {
    document.body.innerHTML = `
      <section><h3>教育经历</h3>
        <div class="edu-item"><input id="a"><button type="button">删除</button></div>
        <button type="button" id="add">+ 添加教育经历</button></section>
      <button type="button">添加附件</button>`;
    expect(findAddButton(document.getElementById('a') as HTMLElement)?.id).toBe('add');
  });

  it('returns null when nothing looks like an add button', () => {
    document.body.innerHTML = '<div><input id="a"><button>保存</button></div>';
    expect(findAddButton(document.getElementById('a') as HTMLElement)).toBeNull();
  });

  it('ignores hidden, disabled and long-text candidates', () => {
    document.body.innerHTML = `
      <div><input id="a">
        <button hidden>添加</button><button disabled>Add</button>
        <a class="add-row">添加一条新的记录然后继续填写更多内容吧朋友们</a></div>`;
    expect(findAddButton(document.getElementById('a') as HTMLElement)).toBeNull();
  });
});

describe('planExpansion', () => {
  const el = () => document.createElement('input');
  const fresh = () => ({ clicks: 0, lastBlocks: { education: 0, experience: 0, projects: 0 } });

  it('asks for one click per group when the profile has more entries than blocks', () => {
    const a = el();
    const plan = planExpansion(
      [{ group: 'education', repeatIndex: 0, element: a }, { group: 'experience', repeatIndex: 0, element: el() }],
      { education: 2, experience: 1, projects: 0 },
      fresh(),
    );
    expect(plan).toEqual([{ group: 'education', anchor: a }]);
  });

  it('anchors on the last block of the group', () => {
    const last = el();
    const plan = planExpansion(
      [{ group: 'projects', repeatIndex: 1, element: last }, { group: 'projects', repeatIndex: 0, element: el() }],
      { education: 0, experience: 0, projects: 3 },
      { clicks: 1, lastBlocks: { education: 0, experience: 0, projects: 1 } },
    );
    expect(plan).toEqual([{ group: 'projects', anchor: last }]);
  });

  it('stops when the last click did not add a block, and respects the global cap', () => {
    const fields = [{ group: 'education' as const, repeatIndex: 0, element: el() }];
    const stuck = { clicks: 1, lastBlocks: { education: 1, experience: 0, projects: 0 } };
    expect(planExpansion(fields, { education: 3, experience: 0, projects: 0 }, stuck)).toEqual([]);
    const capped = { clicks: 10, lastBlocks: { education: 0, experience: 0, projects: 0 } };
    expect(planExpansion(fields, { education: 3, experience: 0, projects: 0 }, capped)).toEqual([]);
  });
});
