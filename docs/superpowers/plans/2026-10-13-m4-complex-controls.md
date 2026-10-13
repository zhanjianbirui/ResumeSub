# ResumeSub M4 复杂控件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让自动填写支持真实网申页上常见的复杂控件：
- 自定义下拉框：ARIA combobox、Ant Design Select、Element UI/Plus Select；
- 日期选择器：Ant DatePicker/RangePicker、Element date-editor；
- 可重复区块：档案里的经历比页面上的区块多时，自动点"添加"补出区块；
- 预留站点适配器接口（Workday、北森的专用适配器等用户提供真实页面样本后再写）。

**Architecture:**
- 填写器改成异步，因为下拉框要先展开，再等选项渲染出来。
- 新增两种字段类型 `combobox` 和 `datepicker`。扫描器把整个组件当作一个字段上报。
- 下拉框的选项要展开后才会出现，所以 background 返回的是"候选文字列表"。content 展开下拉框后，用共享的纯函数 `chooseOption` 在本地匹配选项并点击。
- background 在 plan 中返回每类经历的条数（`counts`）和每个填写指令所属的类别（`group`）。content 据此判断要不要点"添加"按钮。
- `chooseOption` 移到 `src/shared/option-match.ts`（纯函数），content 和 background 共用。

**Tech Stack:** 沿用 M1–M3。

**Spec:** `docs/superpowers/specs/2026-10-13-resume-autofill-extension-design.md`（§6 填写器、可重复区块，§11 M4）。用户已决定：Workday 和北森的适配器延后，等有真实页面样本再做。

## Global Constraints

- content script 不得引入 valibot、preact 或任何 background 模块；产物 `content-scripts/autofill.js` 小于 51200 字节
- 不覆盖已有值：自定义下拉框已经有选中项、日期框已经有值时，都跳过
- 不点击"下一步"或"提交"。唯一允许的自动点击：
  - 展开下拉框；
  - 点选下拉选项；
  - 可重复区块的"添加"按钮（文字匹配"添加 / 新增 / 增加 / Add"，并且不含"删除 / Remove"），整页最多点 10 次，同一类经历每轮最多点 1 次。
- 下拉框展开后必须收起：选中选项后自动收起；匹配失败时按 Escape 收起。每个下拉框最多等待 1500ms
- 单个文件 ≤ 400 行，函数 ≤ 50 行；不修改入参；正则里不写嵌套量词，也不写有歧义的相邻 `\s*`
- 依赖版本：vitest 5（钩子回调要写成带花括号的函数体）、TypeScript 7（开启 noUncheckedIndexedAccess）、preact 11、wxt 0.21；happy-dom 不做布局计算，测试中用已有的 `layoutAvailable` 机制处理
- 测试只用虚构数据；覆盖率 ≥ 80%
- 提交信息格式 `<type>: <description>`

## File Structure

```
src/shared/option-match.ts            (新) chooseOption（从 background/autofill/options.ts 迁出，原文件改为 re-export）
src/shared/autofill-types.ts          (改) FieldKind 增加 combobox、datepicker；FillInstruction 增加 candidates、group；PlanResponse.ready 增加 counts
src/background/autofill/plan.ts       (改) 生成 combobox 和 datepicker 的指令、group 和 counts
src/background/autofill/values.ts     (改) formatDate 支持 datepicker
src/content/widgets.ts                (新) 识别组件（下拉框根节点、日期选择器）和读取表单项标签
src/content/scan.ts                   (改) 上报 combobox 和 datepicker 字段，按组件根节点去重
src/content/label.ts                  (改) resolveLabel 增加"表单项标签"和"适配器 labelFor"两种来源
src/content/adapters.ts               (新) SiteAdapter 接口和空注册表
src/content/combobox.ts               (新) 异步填写自定义下拉框
src/content/datepicker.ts             (新) 异步填写日期选择器
src/content/fill.ts                   (改) applyFill 改为异步，按类型分派
src/content/expand.ts                 (新) 查找并点击"添加"按钮
src/content/run.ts                    (改) 串行 await 填写，并在填写后检查是否需要补出区块
```

---

### Task 1: 共享匹配函数、新字段类型与 plan 扩展

**Files:**
- Create: `src/shared/option-match.ts`
- Modify: `src/background/autofill/options.ts`、`src/shared/autofill-types.ts`、`src/background/autofill/plan.ts`、`src/background/autofill/values.ts`
- Test: `tests/background/autofill/plan.test.ts`（追加）、`tests/shared/option-match.test.ts`

**Interfaces:**
- Produces:
  - `chooseOption(options: readonly FieldOption[], wanted: readonly string[]): string | null`，从 `@/shared/option-match` 导出。行为和现有实现完全一致；`background/autofill/options.ts` 改为 `export { chooseOption } from '@/shared/option-match'`，`synonymsFor` 留在原文件。
  - `FIELD_KINDS` 末尾追加 `'combobox', 'datepicker'`。schema 通过 `v.picklist(FIELD_KINDS)` 自动接受这两个新值。
  - `type EntryGroup = 'education' | 'experience' | 'projects'`
  - `FillInstruction` 增加两个可选字段：`candidates?: string[]`（combobox 用来匹配选项的候选文字）和 `group?: EntryGroup`。
  - `PlanResponse` 中 ready 分支增加 `counts: Record<EntryGroup, number>`。

- [ ] **Step 1: 写失败测试**

`tests/shared/option-match.test.ts`：把 `tests/background/autofill/plan.test.ts` 和 match 测试里所有 `chooseOption` 用例复制过来，改为从 `@/shared/option-match` 导入，内容完全一致，目的是证明迁移后行为不变。

在 `tests/background/autofill/plan.test.ts` 末尾追加（`desc`、`data()` 用文件里已有的辅助函数）：
```ts
describe('M4 plan extensions', () => {
  it('returns display text plus synonym candidates for comboboxes', () => {
    const fills = planFills([desc('d', '学历', { kind: 'combobox' })], data());
    expect(fills).toEqual([{ signature: 'd', value: '硕士', candidates: ['硕士', '研究生', 'master', "master's", 'postgraduate', 'msc'], group: 'education' }]);
  });

  it('formats datepicker values like month inputs and never sends 至今', () => {
    const fills = planFills([
      desc('s', '入学时间', { kind: 'datepicker', section: '教育经历' }),
      desc('e', '毕业时间', { kind: 'datepicker', section: '教育经历' }),
      desc('b', '出生日期', { kind: 'datepicker' }),
    ], { ...data(), profile: { ...data().profile, basic: { ...data().profile.basic, birthDate: '2000-05-17' } } });
    expect(fills).toEqual([
      { signature: 's', value: '2025-09', group: 'education' },
      { signature: 'b', value: '2000-05-17' },
    ]);
  });

  it('tags entry fills with their group and reports entry counts', () => {
    const fills = planFills([desc('c', '公司名称', { section: '实习经历' }), desc('n', '姓名')], data());
    expect(fills).toEqual([
      { signature: 'c', value: '示例科技', group: 'experience' },
      { signature: 'n', value: '李明' },
    ]);
    expect(entryCounts(data())).toEqual({ education: 2, experience: 1, projects: 0 });
  });
});
```
（`entryCounts` 从 `@/background/autofill/plan` 导入。如果 `data()` 里的教育经历 end 是 'present'，上面第二个用例中 `e` 不出现，正是因为 datepicker 下 present 返回 null。）

并在 `tests/background/router.test.ts` 的 ready 断言中加入 `counts`（例如 `{ status: 'ready', fills: [...], counts: { education: 0, experience: 0, projects: 0 } }`）。

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/shared/option-match.test.ts tests/background`
预期：FAIL

- [ ] **Step 3: 实现**

- `src/shared/option-match.ts`：把 `SYNONYMS` 以外与匹配相关的全部代码原样搬过来，包括 `PLACEHOLDER`、`CJK`、`TOKEN`、`keyOf`、`tokensOf`、`MIN_LOOSE`、`QUALIFIER`、`looseHit`、`chooseOption`。这个文件只能 import `@/shared/autofill-types` 中的类型。
- `src/background/autofill/options.ts`：只保留 `SYNONYMS` 和 `synonymsFor`，再加上 `export { chooseOption } from '@/shared/option-match';`
- `src/shared/autofill-types.ts`：按上面 Interfaces 修改；`PlanResponse` 改为：
```ts
export type EntryGroup = 'education' | 'experience' | 'projects';
export type PlanResponse =
  | { status: 'locked' }
  | { status: 'ready'; fills: FillInstruction[]; counts: Record<EntryGroup, number> };
```
- `src/background/autofill/values.ts`：在 `formatDate` 中加入 datepicker 分支：
```ts
  if (field.kind === 'datepicker') {
    if (value === 'present') return null;
    return /y{2,4}|m{2}|年/i.test(field.placeholder) ? renderDate(value, field.placeholder) : value;
  }
```
这个分支必须放在 `if (value === 'present')` 那一行之前，否则 present 会先被转成"至今"。对 datepicker 来说，默认格式是 ISO（`YYYY-MM` 或 `YYYY-MM-DD`）。
- `src/background/autofill/plan.ts`：
```ts
const GROUPS: readonly EntryGroup[] = ['education', 'experience', 'projects'];
const groupOf = (path: FieldPath): EntryGroup | undefined => GROUPS.find((g) => path.startsWith(`${g}.`));

export function entryCounts(data: VaultData): Record<EntryGroup, number> {
  const { education, experience, projects } = data.profile;
  return { education: education.length, experience: experience.length, projects: projects.length };
}
```
在 `buildFill` 中：
  - 如果 `field.kind === 'combobox'`，返回 `{ signature, value: display, candidates: [display, ...synonymsFor(path, raw)].filter((v, i, a) => a.indexOf(v) === i) }`，其中 display 是 `displayValue(path, raw, english)`；
  - 所有非文件的指令，在 `groupOf(path)` 有值时都附带 `group`；
  - select、radio 的现有逻辑不变。
- `src/background/handlers.ts`：autofill.plan 在 ready 分支返回 `{ status: 'ready', fills: planFills(req.fields, data), counts: entryCounts(data) }`。

- [ ] **Step 4: 运行测试，确认通过**

运行：`npm test && npm run compile`
预期：PASS。content 侧（run.ts 等）读取 PlanResponse 时，如果因为新增的 counts 出现类型报错，按需补上；content 逻辑在 Task 3/4 改。

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: combobox/datepicker plan instructions with entry groups and counts"
```

---

### Task 2: 识别自定义下拉框、日期选择器和表单项标签

**Files:**
- Create: `src/content/widgets.ts`, `src/content/adapters.ts`
- Modify: `src/content/scan.ts`, `src/content/label.ts`
- Test: `tests/content/widgets.test.ts`

**Interfaces:**
- Produces:
  - `comboboxRoot(el: HTMLElement): HTMLElement | null`：返回组件根节点，可能是 `.ant-select`、`.el-select`、`[role=combobox]` 本身，或 `button[aria-haspopup=listbox]`
  - `isDatePicker(el: HTMLElement): boolean`
  - `formItemLabel(el: HTMLElement): string`
  - `interface SiteAdapter { id: string; matches(url: URL): boolean; labelFor?(el: HTMLElement): string | null }`
  - `ADAPTERS: readonly SiteAdapter[]`（暂时为空）
  - `activeAdapter(url: string): SiteAdapter | null`

- [ ] **Step 1: 写失败测试**

`tests/content/widgets.test.ts`：
```ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/content/widgets.test.ts`
预期：FAIL

- [ ] **Step 3: 实现**

`src/content/adapters.ts`：
```ts
/** 站点专用适配器（Workday、北森等），等有真实页面样本后再注册具体实现。 */
export interface SiteAdapter {
  id: string;
  matches(url: URL): boolean;
  labelFor?(el: HTMLElement): string | null;
}

export const ADAPTERS: readonly SiteAdapter[] = [];

export function activeAdapter(url: string, adapters: readonly SiteAdapter[] = ADAPTERS): SiteAdapter | null {
  try {
    const parsed = new URL(url);
    return adapters.find((a) => a.matches(parsed)) ?? null;
  } catch {
    return null;
  }
}
```

`src/content/widgets.ts`：
```ts
import { clean } from './label';

const SELECT_ROOT = '.ant-select, .el-select';
const ARIA_TRIGGER = '[role="combobox"]:not(input), button[aria-haspopup="listbox"]';
const PICKER = '.ant-picker, .el-date-editor, [class*="date-picker"], [class*="datepicker"]';
const FORM_ITEM = '.ant-form-item, .el-form-item, .form-item';
/** 表单项里的控件多于 2 个时，说明它是包住多个字段的外层容器，不能当作单个字段的标签来源。 */
const MAX_ITEM_CONTROLS = 2;
const FORM_ITEM_LABEL = '.ant-form-item-label, .el-form-item__label, label';
const MAX_LABEL = 60;

/** 自定义下拉框的根节点：带框架类名的容器、ARIA combobox 本身，或 listbox 触发按钮。 */
export function comboboxRoot(el: HTMLElement): HTMLElement | null {
  const framework = el.closest<HTMLElement>(SELECT_ROOT);
  if (framework) return framework;
  if (el.matches(ARIA_TRIGGER)) return el;
  if (el instanceof HTMLInputElement && el.getAttribute('role') === 'combobox' && el.readOnly) return el;
  return null;
}

export function isDatePicker(el: HTMLElement): boolean {
  return el instanceof HTMLInputElement && el.closest(PICKER) !== null;
}

export function formItemLabel(el: HTMLElement): string {
  const item = el.closest(FORM_ITEM);
  if (!item || item.querySelectorAll('input, select, textarea').length > MAX_ITEM_CONTROLS) return '';
  const label = item.querySelector(FORM_ITEM_LABEL);
  const text = clean(label?.textContent);
  return text.length <= MAX_LABEL ? text : '';
}

/** 区间选择器（两个输入框共用一个表单项标签）：用"标签 + 占位文字"区分开始和结束。 */
export function pickerLabel(el: HTMLInputElement, baseLabel: string): string {
  const picker = el.closest(PICKER);
  const inputs = picker ? picker.querySelectorAll('input').length : 1;
  return inputs > 1 && el.placeholder ? `${baseLabel} ${el.placeholder}`.trim() : baseLabel;
}

export const ARIA_TRIGGER_SELECTOR = ARIA_TRIGGER;
```

`src/content/label.ts`：在 `resolveLabel` 中：
- 最前面，如果 `activeAdapter(el.ownerDocument.location?.href ?? '')?.labelFor?.(el)` 返回非空字符串，直接用它。
- 在 `aria-label` 之后、`nearbyText` 之前，插入 `const item = formItemLabel(el); if (item) return item;`。注意避免循环 import：`formItemLabel` 只依赖 `clean`。如果 `widgets.ts` 和 `label.ts` 互相 import 导致循环，就把 `clean` 移到 `src/content/text.ts`。

`src/content/scan.ts`：
- 遍历的选择器改为 `'input, select, textarea, [role="combobox"]:not(input), button[aria-haspopup="listbox"]'`。
- 对每个元素先算 `const root = comboboxRoot(el)`。如果 root 不为 null：kind 为 `'combobox'`，上报的 element 是 root；用 `seenRoots: Set<HTMLElement>` 去重；可见性检查对 root 做（root 必须可见；`readOnly` 不作为跳过理由）；label 用 `resolveLabel(root)`，为空时再试 `resolveLabel(el)`。
- 如果 `isDatePicker(el)`：kind 为 `'datepicker'`，允许 readonly，label 用 `pickerLabel(el, resolveLabel(el))`。
- 其他控件沿用原逻辑，普通 readonly 输入框继续跳过。
- 上面的分支判断如果让 `scanFields` 或 `draftFor` 超过 50 行，就拆出 `widgetDraft(el, root, ...)`。

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/content && npm run compile`
预期：PASS，原有的 content 测试也全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/content tests/content
git commit -m "feat: scan custom selects, date pickers and form-item labels"
```

---

### Task 3: 异步填写器：自定义下拉框与日期选择器

**Files:**
- Create: `src/content/combobox.ts`, `src/content/datepicker.ts`
- Modify: `src/content/fill.ts`、`src/content/run.ts`、`tests/content/fill.test.ts`（改为 await），以及其他直接调用 `applyFill` 的测试
- Test: `tests/content/combobox.test.ts`, `tests/content/datepicker.test.ts`

**Interfaces:**
- Produces:
  - `interface FillContext { doc: Document; wait(ms: number): Promise<void>; timeoutMs: number }`
  - `defaultContext(doc: Document): FillContext`：默认 timeoutMs 为 1500，wait 用 setTimeout 实现
  - `applyFill(field, fill, ctx?: Partial<FillContext> & FillDeps): Promise<FillOutcome>`，原有类型的行为不变，只是改为异步
  - `fillCombobox(root: HTMLElement, fill: FillInstruction, ctx: FillContext): Promise<FillOutcome>`
  - `fillDatePicker(el: HTMLInputElement, value: string, ctx: FillContext): Promise<FillOutcome>`

- [ ] **Step 1: 写失败测试**

`tests/content/combobox.test.ts`：用 happy-dom 模拟 Ant Select 的展开和选中行为（测试里自己写事件处理函数来模拟组件）：
```ts
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
});
```

`tests/content/datepicker.test.ts`：
```ts
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
```

把 `tests/content/fill.test.ts` 中的 `applyFill(...)` 断言改为 `await applyFill(...)`，测试名不变。原有的 run、session 测试应当不做修改就能通过；如果需要等待异步，只调整等待方式。

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/content`
预期：FAIL

- [ ] **Step 3: 实现**

`src/content/combobox.ts`：
```ts
import type { FillInstruction } from '@/shared/autofill-types';
import { chooseOption } from '@/shared/option-match';
import type { FillContext, FillOutcome } from './fill';

const OPTION = '[role="option"], .ant-select-item-option, .el-select-dropdown__item';
const DROPDOWN = '.ant-select-dropdown, .el-select-dropdown, .el-popper, [role="listbox"]';
const OPENER = '.ant-select-selector, .el-select__wrapper, .el-input, .el-input__inner';
const POLL_MS = 30;

function press(target: HTMLElement, ...types: string[]) {
  for (const type of types) target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

function hasSelection(root: HTMLElement): boolean {
  if (root.querySelector('.ant-select-selection-item')) return true;
  const input = root.querySelector<HTMLInputElement>('.el-input__inner, .el-select__input');
  if (input && input.value.trim() !== '') return true;
  return root.matches('button, [role="combobox"]:not(input)')
    && root.getAttribute('aria-haspopup') === 'listbox'
    && !/^(select|choose|请选择|--)/i.test((root.textContent ?? '').trim())
    && (root.textContent ?? '').trim() !== '';
}

const visible = (el: HTMLElement) => !el.hidden && !el.closest('[hidden], .ant-select-dropdown-hidden') && el.style.display !== 'none';

function optionsFor(root: HTMLElement, doc: Document): HTMLElement[] {
  const controls = root.getAttribute('aria-controls') ?? root.querySelector('[aria-controls]')?.getAttribute('aria-controls');
  const owned = controls ? doc.getElementById(controls) : null;
  const scope = owned ?? [...doc.querySelectorAll<HTMLElement>(DROPDOWN)].filter(visible).pop() ?? null;
  return scope ? [...scope.querySelectorAll<HTMLElement>(OPTION)].filter(visible) : [];
}

async function waitForOptions(root: HTMLElement, ctx: FillContext): Promise<HTMLElement[]> {
  for (let waited = 0; waited <= ctx.timeoutMs; waited += POLL_MS) {
    const found = optionsFor(root, ctx.doc);
    if (found.length > 0) return found;
    await ctx.wait(POLL_MS);
  }
  return [];
}

function close(ctx: FillContext) {
  const target = (ctx.doc.activeElement as HTMLElement | null) ?? ctx.doc.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/** 展开下拉框 → 等选项渲染 → 用候选文字本地匹配 → 点击；匹配失败就收起，不改动当前值。 */
export async function fillCombobox(root: HTMLElement, fill: FillInstruction, ctx: FillContext): Promise<FillOutcome> {
  if (hasSelection(root)) return 'skipped';
  const wanted = [fill.value ?? '', ...(fill.candidates ?? [])].filter(Boolean);
  if (wanted.length === 0) return 'failed';
  press(root.querySelector<HTMLElement>(OPENER) ?? root, 'mousedown', 'mouseup', 'click');
  const options = await waitForOptions(root, ctx);
  const index = chooseOption(options.map((o, i) => ({ value: String(i), label: (o.textContent ?? '').trim() })), wanted);
  const target = index === null ? undefined : options[Number(index)];
  if (!target) {
    close(ctx);
    return 'failed';
  }
  press(target, 'mousedown', 'mouseup', 'click');
  await ctx.wait(POLL_MS);
  return 'filled';
}
```

`src/content/datepicker.ts`：
```ts
import type { FillContext, FillOutcome } from './fill';
import { setNativeValue } from './fill';

const SETTLE_MS = 60;

function key(el: HTMLElement, name: string, code: number) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: name, code: name, keyCode: code, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: name, code: name, keyCode: code, bubbles: true }));
}

/** 日期组件一般允许直接输入：先写入值，再按 Enter 提交，最后按 Escape 收起面板；写入后回读确认。 */
export async function fillDatePicker(el: HTMLInputElement, value: string, ctx: FillContext): Promise<FillOutcome> {
  if (el.value.trim() !== '') return 'skipped';
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  key(el, 'Enter', 13);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await ctx.wait(SETTLE_MS);
  key(el, 'Escape', 27);
  el.blur();
  return el.value.trim() !== '' ? 'filled' : 'failed';
}
```

`src/content/fill.ts`：
- 导出 `setNativeValue`。
- 导出 `FillContext`、`defaultContext(doc)`。
- `applyFill` 改为 `async`，先按 kind 分派：`combobox` 调用 `fillCombobox(field.element, fill, ctx)`；`datepicker` 在 `fill.value` 存在时调用 `fillDatePicker(field.element as HTMLInputElement, fill.value, ctx)`；其余类型保持原有的同步分支（`try` 和 `console.warn` 保留）。
- `hasValue` 增加两种情况：combobox root 用 combobox.ts 中导出的 `hasSelection`；datepicker 和普通输入框相同。为避免循环依赖，`hasSelection` 可以放进 widgets.ts。

`src/content/run.ts`：
- `outcomeOf` 和 `applyAll` 改为 async，按字段顺序 `await` 串行执行，不能用 Promise.all，因为下拉框要一个一个展开。
- `createAutofillSession` 的 deps 增加可选的 `fillContext?: Partial<FillContext>`，测试中可以传入较短的 timeout。

- [ ] **Step 4: 运行测试，确认通过**

运行：`npm test && npm run compile`
预期：PASS

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: async fillers for custom selects and date pickers"
```

---

### Task 4: 自动补出可重复区块

**Files:**
- Create: `src/content/expand.ts`
- Modify: `src/content/run.ts`
- Test: `tests/content/expand.test.ts`

**Interfaces:**
- Produces:
  - `findAddButton(anchor: HTMLElement): HTMLElement | null`：从 anchor 往上最多找 6 层祖先，在每层祖先里找第一个可见、文字匹配添加类词语、不匹配删除类词语的 `button`、`a`、`[role=button]` 或 `[class*="add"]`
  - `interface ExpandState { clicks: number; lastBlocks: Record<EntryGroup, number> }`，`MAX_EXPAND_CLICKS = 10`
  - `planExpansion(fields: readonly { group?: EntryGroup; repeatIndex: number; element: HTMLElement }[], counts: Record<EntryGroup, number>, state: ExpandState): { group: EntryGroup; anchor: HTMLElement }[]`：按 group 统计页面上已有的区块数（最大 repeatIndex + 1）；只有当档案条数大于区块数、区块数比上次点击后有增长（或者是第一次）、并且总点击数还没到上限时，才产出一个点击计划

- [ ] **Step 1: 写失败测试**

`tests/content/expand.test.ts`：
```ts
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

  it('stops when the last click did not add a block, and respects the global cap', () => {
    const fields = [{ group: 'education' as const, repeatIndex: 0, element: el() }];
    const stuck = { clicks: 1, lastBlocks: { education: 1, experience: 0, projects: 0 } };
    expect(planExpansion(fields, { education: 3, experience: 0, projects: 0 }, stuck)).toEqual([]);
    const capped = { clicks: 10, lastBlocks: { education: 0, experience: 0, projects: 0 } };
    expect(planExpansion(fields, { education: 3, experience: 0, projects: 0 }, capped)).toEqual([]);
  });
});
```
在 `tests/content/run.test.ts` 中追加一个 session 级别的用例：页面上有一个 `.edu-item`（含"学校名称"和"专业"）和一个"添加教育经历"按钮，按钮点击后再追加一个同样结构的区块。requestPlan 的假实现按 repeatIndex 返回 `education[i]` 的学校名，`counts.education = 2`。连续调用 `session.run()` 两次后，两个区块的学校都已填好，按钮恰好被点击 1 次。

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/content/expand.test.ts tests/content/run.test.ts`
预期：FAIL

- [ ] **Step 3: 实现**

`src/content/expand.ts`：
```ts
import type { EntryGroup } from '@/shared/autofill-types';

const ADD = /添加|新增|增加|\badd\b|^\+/i;
const NOT_ADD = /删除|移除|remove|delete|附件|attachment|上传|upload|保存|提交|下一步|submit|next/i;
const CLICKABLE = 'button, a, [role="button"], [class*="add"]';
const MAX_DEPTH = 6;
export const MAX_EXPAND_CLICKS = 10;

export interface ExpandState {
  clicks: number;
  lastBlocks: Record<EntryGroup, number>;
}

const visible = (el: HTMLElement) => !el.hidden && !el.closest('[hidden]') && el.style.display !== 'none';

function looksLikeAdd(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').trim();
  return text.length > 0 && text.length <= 20 && ADD.test(text) && !NOT_ADD.test(text);
}

export function findAddButton(anchor: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = anchor.parentElement;
  for (let depth = 0; node && depth < MAX_DEPTH; depth++, node = node.parentElement) {
    const hit = [...node.querySelectorAll<HTMLElement>(CLICKABLE)].find((el) => visible(el) && looksLikeAdd(el));
    if (hit) return hit;
  }
  return null;
}

interface ExpandField {
  group?: EntryGroup;
  repeatIndex: number;
  element: HTMLElement;
}

export function planExpansion(
  fields: readonly ExpandField[],
  counts: Record<EntryGroup, number>,
  state: ExpandState,
): { group: EntryGroup; anchor: HTMLElement }[] {
  const groups: EntryGroup[] = ['education', 'experience', 'projects'];
  const plans: { group: EntryGroup; anchor: HTMLElement }[] = [];
  for (const group of groups) {
    const inGroup = fields.filter((f) => f.group === group);
    const last = inGroup.reduce<ExpandField | undefined>((a, f) => (!a || f.repeatIndex >= a.repeatIndex ? f : a), undefined);
    if (!last) continue;
    const blocks = last.repeatIndex + 1;
    const grew = state.lastBlocks[group] === 0 || blocks > state.lastBlocks[group];
    if (counts[group] > blocks && grew && state.clicks + plans.length < MAX_EXPAND_CLICKS) {
      plans.push({ group, anchor: last.element });
    }
  }
  return plans;
}
```

`src/content/run.ts`：
- session 维护 `expand: ExpandState`，初始值为 `{ clicks: 0, lastBlocks: { education: 0, experience: 0, projects: 0 } }`，并按不可变方式更新。
- 维护 `groupSeen: { group?: EntryGroup; repeatIndex: number; element: HTMLElement }[]`，跨多轮 run 累积，因为区块数要包括之前几轮已经扫描到的字段。
- 每次 ready 并完成填写后：把本轮有 group 的指令对应的字段加入 groupSeen；调用 `planExpansion(groupSeen, plan.counts, expand)`；对每个计划，`findAddButton(anchor)?.click()`。点击成功时，`expand` 更新为 `clicks + 1`，并把 `lastBlocks[group]` 设为当前区块数。
- 新区块插入后会触发已有的重扫调度器（它监听新增的表单控件），后续填写自动接上。

- [ ] **Step 4: 运行测试，确认通过**

运行：`npm test && npm run compile`
预期：PASS

- [ ] **Step 5: Commit**

```bash
git add src/content tests/content
git commit -m "feat: expand repeatable sections by clicking add when the profile has more entries"
```

---

### Task 5: M4 验收

- [ ] **Step 1:** `npm run coverage` 通过，四项覆盖率都 ≥ 80%。
- [ ] **Step 2:** `npm run compile && npm run build`；`wc -c .output/chrome-mv3/content-scripts/autofill.js` 小于 51200；产物中 grep 不到 valibot 和 preact；manifest 没有变化。
- [ ] **Step 3:** 由 controller 在真实 Chromium 中验证，使用本地 fixture 页，页面通过 CDN 加载真实的 antd 和 element-plus UMD 组件（下拉框、日期选择器、点"添加"可重复的区块）。这一步不需要 implementer 执行。
- [ ] **Step 4:** 前面步骤有修复时才提交：`git commit -m "test: M4 acceptance fixes"`。
