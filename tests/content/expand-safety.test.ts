// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { findAddButton } from '@/content/expand';

afterEach(() => {
  document.body.innerHTML = '';
});

const anchor = () => document.getElementById('a') as HTMLElement;

describe('add-button safety (C4)', () => {
  it.each([
    ['a link with a real href', '<a href="/jobs/new" id="x">添加教育经历</a>'],
    ['a submit button in a form', '<button type="submit" id="x">添加教育经历</button>'],
    ['a button without type in a form', '<button id="x">添加教育经历</button>'],
    ['an aria-disabled button', '<span role="button" aria-disabled="true" id="x">添加教育经历</span>'],
  ])('never clicks %s', (_name, html) => {
    document.body.innerHTML = `<form><div class="edu"><input id="a"></div>${html}</form>`;
    expect(findAddButton(anchor(), 'education')).toBeNull();
  });

  it.each([
    ['href="#"', '<a href="#" id="x">添加教育经历</a>'],
    ['href="javascript:void(0)"', '<a href="javascript:void(0)" id="x">添加教育经历</a>'],
    ['type="button"', '<button type="button" id="x">添加教育经历</button>'],
  ])('allows a link or button with %s', (_name, html) => {
    document.body.innerHTML = `<form><div class="edu"><input id="a"></div>${html}</form>`;
    expect(findAddButton(anchor(), 'education')?.id).toBe('x');
  });

  it('allows a button without type outside any form', () => {
    document.body.innerHTML = '<div><div class="edu"><input id="a"></div><button id="x">添加教育经历</button></div>';
    expect(findAddButton(anchor(), 'education')?.id).toBe('x');
  });
});

describe('add-button targeting (C5)', () => {
  it('does not click an earlier add button of another group', () => {
    document.body.innerHTML = `<div>
      <section><h3>工作经历</h3><div class="job"><input></div><button type="button" id="work">添加工作经历</button></section>
      <section><h3>教育经历</h3><div class="edu"><input id="a"></div></section></div>`;
    expect(findAddButton(anchor(), 'education')).toBeNull();
  });

  it('prefers the add button that names the group over a generic one', () => {
    document.body.innerHTML = `<div><button type="button" id="generic">添加</button>
      <section><div class="edu"><input id="a"></div></section><button type="button" id="edu">+ 添加教育经历</button></div>`;
    expect(findAddButton(anchor(), 'education')?.id).toBe('edu');
  });

  it('treats 项目经历 as projects and 教育经历 as education', () => {
    document.body.innerHTML = `<div><div class="p"><input id="a"></div><button type="button" id="edu">添加教育经历</button>
      <button type="button" id="proj">添加项目经历</button></div>`;
    expect(findAddButton(anchor(), 'projects')?.id).toBe('proj');
    expect(findAddButton(anchor(), 'experience')).toBeNull();
  });

  it('uses a generic add button next to the repeated blocks', () => {
    const block = '<div class="edu"><input name="school"><input name="major"></div>';
    document.body.innerHTML = `<section><div class="list">${block}<div class="edu"><input id="a" name="school"><input name="major"></div></div>
      <button type="button" id="add">添加</button></section>`;
    expect(findAddButton(anchor(), 'education')?.id).toBe('add');
  });

  it('rejects a generic add button whose region also holds another group add button', () => {
    document.body.innerHTML = `<div><div class="edu"><input id="a"></div>
      <div class="toolbar"><button type="button" id="generic">添加</button><button type="button">添加工作经历</button></div></div>`;
    expect(findAddButton(anchor(), 'education')).toBeNull();
  });
});

describe('add-button text and classes (C6)', () => {
  it('does not click a bare "+" stepper', () => {
    document.body.innerHTML = '<div><div class="edu"><input id="a"></div><button type="button">+</button></div>';
    expect(findAddButton(anchor(), 'education')).toBeNull();
  });

  it('matches add class tokens but not words that merely contain "add"', () => {
    document.body.innerHTML = '<div><div class="edu"><input id="a"></div><span class="address">新增地址</span><span class="btn-add" id="x">新增</span></div>';
    expect(findAddButton(anchor(), 'education')?.id).toBe('x');
    document.body.innerHTML = '<div><div class="edu"><input id="a"></div><span class="address">新增地址</span></div>';
    expect(findAddButton(anchor(), 'education')).toBeNull();
  });
});
