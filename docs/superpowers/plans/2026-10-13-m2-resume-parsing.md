# ResumeSub M2 简历解析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 options 页导入 PDF/DOCX 简历，在本地用规则解析成 Profile，并给出校对界面；用户确认后，档案和原始文件一起加密保存。

**Architecture:** 分三层，全部在 options 页运行，不联网：
- `extract/`：把文件变成 `TextLine[]`。PDF 用 pdf.js 读取文字坐标，再按行和片段分组；DOCX 用 mammoth 取出纯文本，按段落和 Tab 切分。这两个库都只在 options 页里动态加载。
- `parser/`：纯函数，把 `TextLine[]` 解析成 `ParseResult`，包含 Profile、警告和原文。
- `import/`：负责校验文件、串起上面两层，并把原文件编码成 `ResumeFile`。

确认导入时，通过新的 `resume.import` 消息一次性原子写入 vault（profile 和 resumeFile 同时写入）。

**Tech Stack:** M1 的全部技术栈，另外加 pdfjs-dist 和 mammoth

**Spec:** `docs/superpowers/specs/2026-10-13-resume-autofill-extension-design.md`（§5 简历解析；本计划对应 §11 的 M2。AI 解析属于 M5，不在本计划范围内）

## Global Constraints

- 解析全程在本地完成，不发起任何网络请求
- 运行时依赖只新增 `pdfjs-dist` 和 `mammoth` 两个，开发依赖不新增
- pdf.js 和 mammoth 只能通过动态 `import()` 在 options 页加载；popup 和 background 的 bundle 中不能出现它们
- 简历文件不超过 5MB，只接受 PDF 和 DOCX
- 原文用文本节点显示，不使用 `innerHTML`
- 单个文件不超过 400 行，函数不超过 50 行；不就地修改入参（函数内部的局部累加变量可以修改）
- 测试数据只使用虚构信息，真实简历不进入仓库
- 覆盖率 ≥ 80%（`pdf-browser.ts`、`background.ts`、`main.tsx` 不统计）
- vitest 5 注意事项：`beforeEach` / `afterEach` 的回调要写成带花括号的函数体，否则返回值会被当作 teardown
- 当前依赖版本：vite 8、vitest 5、wxt 0.21.4、TypeScript 7、preact 11。JSX 通过 tsconfig 的 `jsxImportSource: preact` 处理
- UI 文案使用中文；commit 格式为 `<type>: <description>`

## File Structure

```
src/shared/constants.ts        (改) 新增 MAX_RESUME_BYTES / MAX_RESUME_BASE64 / RESUME_MIMES
src/shared/schema/vault-data.ts(改) ResumeFileSchema 加上长度限制和 mime 白名单
src/shared/messages.ts         (改) 新增 resume.import
src/background/handlers.ts     (改) 处理 resume.import
src/shared/text-line.ts        TextLine 类型 + lineText
src/extract/group-lines.ts     PositionedText[] → TextLine[]（纯函数）
src/extract/pdf.ts             readPdfItems(data, pdfjs)（注入 pdfjs，Node 中可测试）
src/extract/pdf-browser.ts     浏览器接线：pdfjs-dist + worker url
src/extract/docx.ts            paragraphsToLines + extractDocx（动态 import mammoth）
src/extract/index.ts           detectKind + extractLines（按类型动态 import）
src/parser/types.ts            ParseWarning / ParseResult / Parsed<T> / warnings()
src/parser/text.ts             splitList / splitOnce / splitTrailing / splitLocation
src/parser/dates.ts            findDateRange / removeRange / findMonth
src/parser/contacts.ts         extractContacts
src/parser/degree.ts           detectDegree / stripDegree
src/parser/sections.ts         headingKey / splitSections
src/parser/entries.ts          isBullet / stripBullet / joinWrapped / mergeBullets / splitEntries / entryTitle
src/parser/header.ts           parseHeader
src/parser/education.ts        parseEducation
src/parser/experience.ts       parseExperience
src/parser/projects.ts         parseProjects
src/parser/skills.ts           parseSkills
src/parser/awards.ts           parseAwards
src/parser/parse-resume.ts     parseResume（组装）
src/parser/merge.ts            mergeParsed(current, parsed)
src/import/errors.ts           ImportError
src/import/import-resume.ts    importResume(file, extract?)
src/entrypoints/options/ResumeImport.tsx  文件选择与解析
src/entrypoints/options/ReviewView.tsx    校对界面
src/entrypoints/options/ProfileEditor.tsx (改) 新增 saveLabel 属性
src/entrypoints/options/App.tsx           (改) 新增 review 视图
src/ui/base.css                           (改) .review / .raw 样式
tests/helpers/lines.ts                    TextLine 构造器 + 虚构中文/英文简历 fixture
tests/helpers/make-pdf.ts                 生成最小 PDF（ASCII + Helvetica）
```

---

### Task 1: resume.import 消息与 ResumeFile 约束

**Files:**
- Modify: `src/shared/constants.ts`, `src/shared/schema/vault-data.ts`, `src/shared/messages.ts`, `src/background/handlers.ts`
- Test: `tests/background/router.test.ts`（追加）

**Interfaces:**
- Produces:
  - `MAX_RESUME_BYTES = 5 * 1024 * 1024`
  - `MAX_RESUME_BASE64 = Math.ceil(MAX_RESUME_BYTES / 3) * 4`
  - `RESUME_MIMES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } as const`
  - `ResumeFile = { name: string; mime: pdf|docx 的 MIME; dataBase64: string }`
  - 请求 `{ type: 'resume.import', profile: Profile, file: ResumeFile }`，响应 `null`

- [ ] **Step 1: 追加失败测试**

在 `tests/background/router.test.ts` 末尾的 `describe('router', ...)` 块内追加（复用文件中已有的 `makeRouter`、`page`、`PW`、`emptyProfile`）：
```ts
  it('imports profile and resume file atomically', async () => {
    const { handle } = makeRouter();
    await handle({ type: 'vault.setup', password: PW }, page);
    const base = emptyProfile();
    const profile = { ...base, basic: { ...base.basic, name: '导入用户' } };
    const file = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' };
    expect(await handle({ type: 'resume.import', profile, file }, page)).toEqual({ ok: true, data: null });
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: true, data: { basic: { name: '导入用户' } } });
  });

  it('rejects resume files with unsupported mime or oversize payload', async () => {
    const { handle } = makeRouter();
    const profile = emptyProfile();
    const badMime = { name: 'cv.exe', mime: 'application/x-msdownload', dataBase64: 'AA==' };
    expect(await handle({ type: 'resume.import', profile, file: badMime }, page))
      .toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    const huge = { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'A'.repeat(MAX_RESUME_BASE64 + 4) };
    expect(await handle({ type: 'resume.import', profile, file: huge }, page))
      .toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });
```
在文件顶部的 import 中加上：`import { MAX_RESUME_BASE64 } from '@/shared/constants';`

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/background/router.test.ts`
预期：FAIL（`MAX_RESUME_BASE64` 未导出；`resume.import` 返回 BAD_REQUEST）

- [ ] **Step 3: 实现**

在 `src/shared/constants.ts` 末尾追加：
```ts
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_BASE64 = Math.ceil(MAX_RESUME_BYTES / 3) * 4;
export const RESUME_MIMES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;
```

`src/shared/schema/vault-data.ts`：把 `ResumeFileSchema` 替换为下面的定义，并加入 `import { MAX_RESUME_BASE64, RESUME_MIMES } from '../constants';`，再导出类型：
```ts
export const ResumeFileSchema = v.object({
  name: v.pipe(v.string(), v.maxLength(255)),
  mime: v.picklist([RESUME_MIMES.pdf, RESUME_MIMES.docx]),
  dataBase64: v.pipe(v.string(), v.maxLength(MAX_RESUME_BASE64)),
});

export type ResumeFile = v.InferOutput<typeof ResumeFileSchema>;
```

`src/shared/messages.ts`：在 `RequestSchema` 数组末尾追加一项，在 `ResponseMap` 中追加一行，并加入 `import { ResumeFileSchema } from './schema/vault-data';`
```ts
  v.object({ type: v.literal('resume.import'), profile: ProfileSchema, file: ResumeFileSchema }),
```
```ts
  'resume.import': null;
```

`src/background/handlers.ts`：在 `case 'profile.save'` 之后加上：
```ts
    case 'resume.import': {
      const data = await d.vault.read();
      await d.vault.write({ ...data, profile: req.profile, resumeFile: req.file });
      await d.autoLock.touch();
      return null;
    }
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/background/router.test.ts && npm run compile`
预期：PASS；tsc 无输出

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add resume.import message with bounded resume file schema"
```

---

### Task 2: 文本提取层（PDF / DOCX → TextLine[]）

**Files:**
- Create: `src/shared/text-line.ts`, `src/extract/group-lines.ts`, `src/extract/pdf.ts`, `src/extract/pdf-browser.ts`, `src/extract/docx.ts`, `src/extract/index.ts`, `src/import/errors.ts`, `tests/helpers/make-pdf.ts`
- Modify: `vitest.config.ts`（coverage 的 exclude 中加入 `src/extract/pdf-browser.ts`）
- Test: `tests/extract/group-lines.test.ts`, `tests/extract/pdf.test.ts`, `tests/extract/docx.test.ts`

**Interfaces:**
- Consumes: `RESUME_MIMES`、`MAX_RESUME_BYTES`（Task 1）
- Produces:
  - `interface TextLine { page: number; y: number; size: number; segments: readonly string[] }`；`lineText(line): string`（各片段之间用空格连接）
  - `interface PositionedText { page; x; y; width; size; text }`；`groupLines(items): TextLine[]`
  - `interface PdfJsLike`；`readPdfItems(data: Uint8Array, pdfjs: PdfJsLike): Promise<PositionedText[]>`
  - `extractPdf(file: Blob): Promise<TextLine[]>`（仅在浏览器中使用）
  - `paragraphsToLines(raw: string): TextLine[]`；`extractDocx(file: Blob): Promise<TextLine[]>`
  - `type ResumeKind = 'pdf' | 'docx'`；`detectKind(file: { name: string; type: string }): ResumeKind | null`；`extractLines(file: File): Promise<TextLine[]>`
  - `type ImportErrorCode = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'NO_TEXT' | 'READ_FAILED'`；`class ImportError extends Error { readonly code }`

- [ ] **Step 1: 安装依赖**

```bash
npm install pdfjs-dist mammoth
```

- [ ] **Step 2: 写 PDF 生成辅助函数和失败测试**

`tests/helpers/make-pdf.ts`：
```ts
export interface PdfText {
  x: number;
  y: number;
  size: number;
  text: string;
}

/** 生成单页、仅含 ASCII 文本、使用 Helvetica 字体的最小合法 PDF（用于测试 pdf.js 的坐标提取）。 */
export function makePdf(texts: readonly PdfText[]): Uint8Array {
  const escape = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = texts.map((t) => `BT /F1 ${t.size} Tf ${t.x} ${t.y} Td (${escape(t.text)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}
```

`tests/extract/group-lines.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { groupLines, type PositionedText } from '@/extract/group-lines';
import { lineText } from '@/shared/text-line';

const item = (text: string, x: number, y: number, extra: Partial<PositionedText> = {}): PositionedText => ({
  page: 1, x, y, width: text.length * 5, size: 10, text, ...extra,
});

describe('groupLines', () => {
  it('joins close items with a space and splits far items into segments', () => {
    const lines = groupLines([
      item('Hello', 0, 700),
      item('World', 27, 700),
      item('2024 - 2025', 400, 700),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].segments).toEqual(['Hello World', '2024 - 2025']);
  });

  it('orders lines top-to-bottom and pages ascending, tolerating y jitter', () => {
    const lines = groupLines([
      item('second', 0, 680),
      item('first-b', 60, 699.2),
      item('first-a', 0, 700),
      item('page2', 0, 800, { page: 2 }),
    ]);
    expect(lines.map(lineText)).toEqual(['first-a first-b', 'second', 'page2']);
  });

  it('drops whitespace-only items and records the largest font size', () => {
    const lines = groupLines([item('   ', 0, 700), item('Name', 0, 700, { size: 18 }), item('x', 30, 700)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].size).toBe(18);
  });

  it('returns no lines for no items', () => {
    expect(groupLines([])).toEqual([]);
  });
});
```

`tests/extract/pdf.test.ts`：
```ts
import { expect, it } from 'vitest';
import { groupLines } from '@/extract/group-lines';
import { type PdfJsLike, readPdfItems } from '@/extract/pdf';
import { makePdf } from '../helpers/make-pdf';

it('extracts positioned text from a real PDF via pdf.js', async () => {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsLike;
  const data = makePdf([
    { x: 50, y: 800, size: 16, text: 'Alex Chen' },
    { x: 50, y: 770, size: 10, text: 'Example University' },
    { x: 450, y: 770, size: 10, text: 'Sep 2024 - Jun 2025' },
  ]);
  const lines = groupLines(await readPdfItems(data, pdfjs));
  expect(lines.map((l) => l.segments)).toEqual([['Alex Chen'], ['Example University', 'Sep 2024 - Jun 2025']]);
  expect(lines[0].size).toBeGreaterThan(lines[1].size);
});
```

`tests/extract/docx.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { paragraphsToLines } from '@/extract/docx';
import { detectKind, extractLines } from '@/extract/index';

describe('paragraphsToLines', () => {
  it('splits paragraphs into lines and tabs into segments, skipping blanks', () => {
    const lines = paragraphsToLines('张三\n\n示例大学\t\t2021.09 – 2025.06\n  \n');
    expect(lines.map((l) => l.segments)).toEqual([['张三'], ['示例大学', '2021.09 – 2025.06']]);
    expect(lines[0].y).toBeGreaterThan(lines[1].y);
  });
});

describe('detectKind', () => {
  it('detects by mime or extension', () => {
    expect(detectKind({ name: 'a.PDF', type: '' })).toBe('pdf');
    expect(detectKind({ name: 'x', type: 'application/pdf' })).toBe('pdf');
    expect(detectKind({ name: 'cv.docx', type: '' })).toBe('docx');
    expect(detectKind({ name: 'cv.doc', type: 'application/msword' })).toBeNull();
  });

  it('extractLines rejects unsupported files', async () => {
    await expect(extractLines(new File(['x'], 'a.txt'))).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/extract`
预期：FAIL（找不到模块）

- [ ] **Step 4: 实现**

`src/shared/text-line.ts`：
```ts
/** 解析器的输入单位：一行视觉文本。segments 是同一行中被较大水平间距隔开的片段（例如左边的机构名和右边的日期）。 */
export interface TextLine {
  page: number;
  y: number;
  size: number;
  segments: readonly string[];
}

export const lineText = (line: TextLine): string => line.segments.join(' ');
```

`src/extract/group-lines.ts`：
```ts
import type { TextLine } from '@/shared/text-line';

export interface PositionedText {
  page: number;
  x: number;
  y: number;
  width: number;
  size: number;
  text: string;
}

/** 间距超过 1.5 倍字号视为新片段（通常是右对齐的日期或地点）；超过 0.15 倍字号补一个空格。 */
const SEGMENT_GAP_EM = 1.5;
const SPACE_GAP_EM = 0.15;

function sameLine(a: PositionedText, b: PositionedText): boolean {
  const tolerance = Math.max(2, Math.min(a.size, b.size) * 0.4);
  return a.page === b.page && Math.abs(a.y - b.y) <= tolerance;
}

function buildLine(items: readonly PositionedText[]): TextLine {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const size = Math.max(...sorted.map((i) => i.size));
  const segments: string[] = [];
  let current = '';
  let lastEnd = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const gap = item.x - lastEnd;
    if (current && gap > size * SEGMENT_GAP_EM) {
      segments.push(current.trim());
      current = '';
    } else if (current && gap > size * SPACE_GAP_EM && !current.endsWith(' ')) {
      current += ' ';
    }
    current += item.text;
    lastEnd = item.x + item.width;
  }
  segments.push(current.trim());
  return { page: sorted[0].page, y: sorted[0].y, size, segments: segments.filter(Boolean) };
}

export function groupLines(items: readonly PositionedText[]): TextLine[] {
  const ordered = items
    .filter((i) => i.text.trim() !== '')
    .sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const groups: PositionedText[][] = [];
  for (const item of ordered) {
    const last = groups[groups.length - 1];
    if (last && sameLine(last[0], item)) last.push(item);
    else groups.push([item]);
  }
  return groups.map(buildLine).filter((line) => line.segments.length > 0);
}
```

`src/extract/pdf.ts`：
```ts
import type { PositionedText } from './group-lines';

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
  destroy(): Promise<void>;
}

/** pdf.js 中我们实际用到的最小接口；浏览器用 pdfjs-dist，测试用它的 legacy 构建。 */
export interface PdfJsLike {
  getDocument(params: { data: Uint8Array; verbosity?: number }): { promise: Promise<PdfDocument> };
}

function toPositioned(page: number, item: PdfTextItem): PositionedText | null {
  if (typeof item.str !== 'string' || !item.transform) return null;
  const [, , c, d, x, y] = item.transform;
  return { page, x, y, width: item.width ?? 0, size: item.height || Math.hypot(c, d), text: item.str };
}

export async function readPdfItems(data: Uint8Array, pdfjs: PdfJsLike): Promise<PositionedText[]> {
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  try {
    const pages = await Promise.all(
      Array.from({ length: doc.numPages }, async (_, i) => {
        const content = await (await doc.getPage(i + 1)).getTextContent();
        return content.items
          .map((item) => toPositioned(i + 1, item))
          .filter((p): p is PositionedText => p !== null);
      }),
    );
    return pages.flat();
  } finally {
    await doc.destroy();
  }
}
```

`src/extract/pdf-browser.ts`：
```ts
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { TextLine } from '@/shared/text-line';
import { groupLines } from './group-lines';
import { type PdfJsLike, readPdfItems } from './pdf';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdf(file: Blob): Promise<TextLine[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  // pdf.js 的完整类型包含 marked-content 条目，结构上与 PdfJsLike 不直接兼容；运行时行为一致
  return groupLines(await readPdfItems(data, pdfjs as unknown as PdfJsLike));
}
```
（如果 tsc 无法识别 `?url` 导入，就在 `src/` 下新增 `vite-env.d.ts`，内容为 `/// <reference types="vite/client" />`。）

`src/extract/docx.ts`：
```ts
import type { TextLine } from '@/shared/text-line';

/** Word 简历常用 Tab 把日期推到右侧，所以 Tab 视为片段分隔。 */
export function paragraphsToLines(raw: string): TextLine[] {
  return raw
    .split(/\r?\n/)
    .map((paragraph) => paragraph.split(/\t+/).map((s) => s.trim()).filter(Boolean))
    .filter((segments) => segments.length > 0)
    .map((segments, i) => ({ page: 1, y: -i, size: 0, segments }));
}

export async function extractDocx(file: Blob): Promise<TextLine[]> {
  const { extractRawText } = await import('mammoth');
  const { value } = await extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return paragraphsToLines(value);
}
```

`src/import/errors.ts`：
```ts
import { MAX_RESUME_BYTES } from '@/shared/constants';

export type ImportErrorCode = 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'NO_TEXT' | 'READ_FAILED';

const MESSAGES: Record<ImportErrorCode, string> = {
  UNSUPPORTED_TYPE: '仅支持 PDF 或 DOCX 格式的简历',
  TOO_LARGE: `文件过大，请上传 ${MAX_RESUME_BYTES / 1024 / 1024}MB 以内的简历`,
  NO_TEXT: '未识别到文字：这可能是扫描件，请使用含文字的 PDF，或之后使用 AI 解析',
  READ_FAILED: '读取文件失败，请确认文件未损坏',
};

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ImportError';
  }
}
```

`src/extract/index.ts`：
```ts
import { ImportError } from '@/import/errors';
import { RESUME_MIMES } from '@/shared/constants';
import type { TextLine } from '@/shared/text-line';

export type ResumeKind = keyof typeof RESUME_MIMES;

export function detectKind(file: { name: string; type: string }): ResumeKind | null {
  const name = file.name.toLowerCase();
  if (file.type === RESUME_MIMES.pdf || name.endsWith('.pdf')) return 'pdf';
  if (file.type === RESUME_MIMES.docx || name.endsWith('.docx')) return 'docx';
  return null;
}

/** 解析库体积大，按需动态加载，确保只进入 options 页的 chunk。 */
export async function extractLines(file: File): Promise<TextLine[]> {
  const kind = detectKind(file);
  if (kind === 'pdf') return (await import('./pdf-browser')).extractPdf(file);
  if (kind === 'docx') return (await import('./docx')).extractDocx(file);
  throw new ImportError('UNSUPPORTED_TYPE');
}
```

`vitest.config.ts`：在 coverage 的 `exclude` 数组中加入 `'src/extract/pdf-browser.ts'`。

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/extract && npm run compile`
预期：PASS（7 个测试）。如果 pdf.js legacy 构建在 Node 中因为环境原因失败（比如缺少某个浏览器全局对象），只在 `tests/extract/pdf.test.ts` 内做最小的环境补丁，**不新增依赖**，并在报告中说明。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src tests vitest.config.ts
git commit -m "feat: extract positioned text lines from PDF and DOCX"
```

---

### Task 3: 解析基础函数（日期、联系方式、学历、文本工具）

**Files:**
- Create: `src/parser/types.ts`, `src/parser/text.ts`, `src/parser/dates.ts`, `src/parser/contacts.ts`, `src/parser/degree.ts`
- Test: `tests/parser/primitives.test.ts`

**Interfaces:**
- Consumes: `TextLine`、`lineText`（Task 2）、`Profile`（M1）
- Produces:
  - `interface ParseWarning { path: string; message: string }`、`interface Parsed<T> { value: T; warnings: ParseWarning[] }`、`interface ParseResult { profile: Profile; warnings: ParseWarning[]; text: string }`
  - `warnings(checks: readonly (readonly [boolean, string, string])[]): ParseWarning[]`（只保留条件为 true 的项，每项为 `[条件, path, message]`）
  - `splitList(text): string[]`、`splitOnce(text, pattern): [string, string] | null`、`splitTrailing(line: TextLine): [string, string | undefined]`、`splitLocation(text): { city?: string; country?: string }`
  - `interface DateRange { start: string; end: string; approximate: boolean; index: number; length: number }`；`findDateRange(text): DateRange | null`；`removeRange(text, range): string`；`findMonth(text): string | undefined`
  - `interface Contacts { phone?; email?; linkedin?; github?; website? }`；`extractContacts(text): Contacts`
  - `type DegreeCode = '' | 'highschool' | 'associate' | 'bachelor' | 'master' | 'phd'`；`detectDegree(text): DegreeCode`；`stripDegree(text): string`

- [ ] **Step 1: 写失败测试**

`tests/parser/primitives.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { extractContacts } from '@/parser/contacts';
import { findDateRange, findMonth, removeRange } from '@/parser/dates';
import { detectDegree, stripDegree } from '@/parser/degree';
import { splitList, splitLocation, splitOnce, splitTrailing } from '@/parser/text';
import { warnings } from '@/parser/types';

describe('findDateRange', () => {
  it.each([
    ['2025.09 – 2026.09', '2025-09', '2026-09'],
    ['2023/7 - 2023/9', '2023-07', '2023-09'],
    ['2021年9月至2025年6月', '2021-09', '2025-06'],
    ['2025.10 – 至今', '2025-10', 'present'],
    ['Sep 2023 – Present', '2023-09', 'present'],
    ['June 2022 to Aug. 2022', '2022-06', '2022-08'],
    ['2024-01 ~ 2024-03', '2024-01', '2024-03'],
  ])('parses %s', (text, start, end) => {
    expect(findDateRange(text)).toMatchObject({ start, end, approximate: false });
  });

  it('marks year-only ranges as approximate', () => {
    expect(findDateRange('2021 - 2025')).toMatchObject({ start: '2021-01', end: '2025-12', approximate: true });
  });

  it('ignores lone dates, invalid months and words like Summary/presentation', () => {
    expect(findDateRange('2025.09')).toBeNull();
    expect(findDateRange('Summary 2020')).toBeNull();
    expect(findDateRange('presentation 2020 slides')).toBeNull();
    expect(findDateRange('2021.13 - 2022.01')).toBeNull();
  });

  it('removeRange strips the range from the line', () => {
    const text = '示例大学 2021.09 – 2025.06';
    expect(removeRange(text, findDateRange(text)!)).toBe('示例大学');
  });

  it('findMonth returns the first month token', () => {
    expect(findMonth('获奖 2023.05')).toBe('2023-05');
    expect(findMonth('2022–2024')).toBeUndefined();
  });
});

describe('extractContacts', () => {
  it('extracts Chinese mobile and email without matching digits inside the email', () => {
    expect(extractContacts('13800138000 | a13800138000@example.com')).toEqual({
      phone: '13800138000', email: 'a13800138000@example.com',
    });
  });

  it('extracts international phone and profile links', () => {
    const text = 'alex@example.com | +44 7700 900123 | linkedin.com/in/alex | github.com/alex | https://alex.dev';
    expect(extractContacts(text)).toEqual({
      email: 'alex@example.com',
      phone: '+447700900123',
      linkedin: 'linkedin.com/in/alex',
      github: 'github.com/alex',
      website: 'https://alex.dev',
    });
  });

  it('returns an empty object when nothing matches', () => {
    expect(extractContacts('无联系方式')).toEqual({});
  });
});

describe('degree', () => {
  it.each([
    ['人工智能 – 理学硕士（在读）', 'master'],
    ['计算机科学与技术 – 本科', 'bachelor'],
    ['MSc Artificial Intelligence', 'master'],
    ['Bachelor of Engineering in Software', 'bachelor'],
    ['PhD in Physics', 'phd'],
    ['大专', 'associate'],
    ['人工智能', ''],
  ])('detectDegree(%s) = %s', (text, code) => {
    expect(detectDegree(text)).toBe(code);
  });

  it.each([
    ['人工智能 – 理学硕士（在读）', '人工智能'],
    ['计算机科学与技术 – 本科', '计算机科学与技术'],
    ['MSc Artificial Intelligence', 'Artificial Intelligence'],
    ['Bachelor of Engineering in Software Engineering', 'Software Engineering'],
  ])('stripDegree(%s) = %s', (text, major) => {
    expect(stripDegree(text)).toBe(major);
  });
});

describe('text helpers', () => {
  it('splitList respects parentheses', () => {
    expect(splitList('中文（母语）、英语（雅思 7，CET-6）, Go')).toEqual(['中文（母语）', '英语（雅思 7，CET-6）', 'Go']);
  });

  it('splitOnce splits at the first match only', () => {
    expect(splitOnce('A – B – C', /\s+[–-]\s+/)).toEqual(['A', 'B – C']);
    expect(splitOnce('ABC', /\|/)).toBeNull();
  });

  it('splitTrailing separates the last segment', () => {
    expect(splitTrailing({ page: 1, y: 0, size: 10, segments: ['a', 'b', 'c'] })).toEqual(['a b', 'c']);
    expect(splitTrailing({ page: 1, y: 0, size: 10, segments: ['only'] })).toEqual(['only', undefined]);
  });

  it('splitLocation splits city and country', () => {
    expect(splitLocation('Manchester, UK')).toEqual({ city: 'Manchester', country: 'UK' });
    expect(splitLocation('福州，中国')).toEqual({ city: '福州', country: '中国' });
    expect(splitLocation('London')).toEqual({ city: 'London', country: undefined });
  });

  it('warnings keeps only true checks', () => {
    expect(warnings([[true, 'a', 'x'], [false, 'b', 'y']])).toEqual([{ path: 'a', message: 'x' }]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/parser/primitives.test.ts`
预期：FAIL（找不到模块）

- [ ] **Step 3: 实现**

`src/parser/types.ts`：
```ts
import type { Profile } from '@/shared/schema/profile';

export interface ParseWarning {
  path: string;
  message: string;
}

export interface Parsed<T> {
  value: T;
  warnings: ParseWarning[];
}

export interface ParseResult {
  profile: Profile;
  warnings: ParseWarning[];
  text: string;
}

/** 把 [条件, path, message] 列表转成警告，只保留条件为 true 的项。 */
export function warnings(checks: readonly (readonly [boolean, string, string])[]): ParseWarning[] {
  return checks.filter(([hit]) => hit).map(([, path, message]) => ({ path, message }));
}
```

`src/parser/text.ts`：
```ts
import type { TextLine } from '@/shared/text-line';

const OPEN = '（([';
const CLOSE = '）)]';
const LIST_SEPARATORS = '、,，;；';

/** 按顿号、逗号、分号切分列表，括号内的分隔符不切。 */
export function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (OPEN.includes(ch)) depth += 1;
    if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && LIST_SEPARATORS.includes(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  return [...parts, current].map((p) => p.trim()).filter(Boolean);
}

export function splitOnce(text: string, pattern: RegExp): [string, string] | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return [text.slice(0, match.index).trim(), text.slice(match.index + match[0].length).trim()];
}

/** 多片段行：前面的片段为正文，最后一个片段通常是右对齐的地点、角色等。 */
export function splitTrailing(line: TextLine): [string, string | undefined] {
  if (line.segments.length < 2) return [line.segments[0] ?? '', undefined];
  return [line.segments.slice(0, -1).join(' '), line.segments[line.segments.length - 1]];
}

export function splitLocation(text: string): { city?: string; country?: string } {
  const [city, ...rest] = text.split(/\s*[,，]\s*/).filter(Boolean);
  return { city, country: rest.length > 0 ? rest.join(', ') : undefined };
}
```

`src/parser/dates.ts`：
```ts
const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const TOKEN = new RegExp(
  [
    String.raw`(\d{4})\s*[./\-年]\s*(1[0-2]|0?[1-9])(?!\d)\s*月?`,
    String.raw`\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})`,
    String.raw`(至今|现在|目前|\bpresent\b|\bnow\b|\bcurrent\b)`,
    String.raw`(?<!\d)((?:19|20)\d{2})(?!\d)`,
  ].join('|'),
  'gi',
);
const SEPARATOR = /^\s*(?:-|–|—|~|～|至|to)\s*$/i;

interface Token {
  value: string;
  kind: 'month' | 'year' | 'present';
  start: number;
  end: number;
}

export interface DateRange {
  start: string;
  end: string;
  approximate: boolean;
  index: number;
  length: number;
}

const pad = (n: number | string) => String(n).padStart(2, '0');

function toToken(m: RegExpMatchArray): Token {
  const start = m.index ?? 0;
  const end = start + m[0].length;
  if (m[1]) return { value: `${m[1]}-${pad(m[2])}`, kind: 'month', start, end };
  if (m[3]) return { value: `${m[4]}-${pad(MONTHS[m[3].toLowerCase()])}`, kind: 'month', start, end };
  if (m[5]) return { value: 'present', kind: 'present', start, end };
  return { value: m[6], kind: 'year', start, end };
}

const tokensOf = (text: string): Token[] => [...text.matchAll(TOKEN)].map(toToken);

export function findDateRange(text: string): DateRange | null {
  const tokens = tokensOf(text);
  for (let i = 0; i + 1 < tokens.length; i++) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (a.kind === 'present' || !SEPARATOR.test(text.slice(a.end, b.start))) continue;
    return {
      start: a.kind === 'year' ? `${a.value}-01` : a.value,
      end: b.kind === 'year' ? `${b.value}-12` : b.value,
      approximate: a.kind === 'year' || b.kind === 'year',
      index: a.start,
      length: b.end - a.start,
    };
  }
  return null;
}

export function removeRange(text: string, range: DateRange): string {
  return `${text.slice(0, range.index)} ${text.slice(range.index + range.length)}`.replace(/\s+/g, ' ').trim();
}

export function findMonth(text: string): string | undefined {
  return tokensOf(text).find((t) => t.kind === 'month')?.value;
}
```

`src/parser/contacts.ts`：
```ts
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const CN_MOBILE = /(?<![\w.@])(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d{4}){2}(?!\d)/;
const INTL_PHONE = /\+\d{1,3}[\s-]?\d[\d\s-]{6,14}\d/;
const LINKEDIN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s|｜,，]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|｜,，]+/i;
const URL = /https?:\/\/[^\s|｜,，]+/gi;

export interface Contacts {
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export function extractContacts(text: string): Contacts {
  const phone = (text.match(CN_MOBILE) ?? text.match(INTL_PHONE))?.[0].replace(/[\s-]/g, '');
  const website = [...text.matchAll(URL)].map((m) => m[0]).find((u) => !/linkedin\.com|github\.com/i.test(u));
  const found: Contacts = {
    email: text.match(EMAIL)?.[0],
    phone,
    linkedin: text.match(LINKEDIN)?.[0],
    github: text.match(GITHUB)?.[0],
    website,
  };
  return Object.fromEntries(Object.entries(found).filter(([, v]) => v !== undefined)) as Contacts;
}
```

`src/parser/degree.ts`：
```ts
export type DegreeCode = '' | 'highschool' | 'associate' | 'bachelor' | 'master' | 'phd';

const RULES: readonly (readonly [Exclude<DegreeCode, ''>, RegExp])[] = [
  ['phd', /博士|ph\.?\s?d\b|\bdoctor(?:ate)?\b/i],
  ['master', /硕士|研究生|\bmaster|\bm\.?sc\b|\bmeng\b|\bmphil\b|\bmba\b|\bm\.?a\.?(?=\s|$)|\bm\.s\.?/i],
  ['bachelor', /本科|学士|\bbachelor|\bb\.?sc\b|\bbeng\b|\bb\.?a\.?(?=\s|$)|\bb\.s\.?/i],
  ['associate', /大专|专科|\bassociate/i],
  ['highschool', /高中|high school/i],
];

const DEGREE_WORDS = new RegExp(
  [
    String.raw`(?:理学|工学|文学|管理学|经济学|法学|医学|教育学|艺术学|农学|哲学|历史学)?(?:学士|硕士|博士)(?:学位|研究生)?`,
    String.raw`本科|研究生|大专|专科`,
    String.raw`\b(?:Bachelor|Master|Doctor)(?:'s)?(?:\s+of\s+[A-Z][a-z]+)?(?:\s+degree)?`,
    String.raw`\b(?:B\.?Sc|BEng|B\.?A|B\.?S|M\.?Sc|MEng|MPhil|M\.?A|M\.?S|MBA|Ph\.?\s?D)\b\.?`,
  ].join('|'),
  'gi',
);

const EDGE_PUNCT = /^[\s–—\-|｜·,，]+|[\s–—\-|｜·,，]+$/g;

export function detectDegree(text: string): DegreeCode {
  return RULES.find(([, re]) => re.test(text))?.[0] ?? '';
}

/** 去掉学位词、括号注释（如“在读”）和首尾分隔符，剩下的就是专业名。 */
export function stripDegree(text: string): string {
  return text
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(DEGREE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCT, '')
    .replace(/^(?:in|of)\s+/i, '')
    .trim();
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/parser/primitives.test.ts`
预期：PASS。如果个别正则用例失败，修正**正则**让用例通过（用例就是规格），不要改用例；改动写入报告。

- [ ] **Step 5: Commit**

```bash
git add src/parser tests/parser
git commit -m "feat: add resume parsing primitives for dates, contacts and degrees"
```

---

### Task 4: 分节与条目切分

**Files:**
- Create: `src/parser/sections.ts`, `src/parser/entries.ts`, `tests/helpers/lines.ts`
- Test: `tests/parser/structure.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `findDateRange`、`removeRange`、`DateRange`；Task 2 的 `TextLine`、`lineText`
- Produces:
  - `type SectionKey = 'education' | 'experience' | 'projects' | 'skills' | 'awards' | 'other'`
  - `headingKey(line): SectionKey | null`
  - `splitSections(lines): { header: TextLine[]; sections: Partial<Record<SectionKey, TextLine[]>> }`
  - `interface Entry { head: TextLine; range: DateRange | null; subs: TextLine[]; bullets: string[] }`
  - `isBullet(text)`、`stripBullet(text)`、`joinWrapped(prev, next)`、`mergeBullets(lines): string[]`
  - `splitEntries(lines): { entries: Entry[]; orphans: TextLine[] }`、`entryTitle(entry): string`（头行去掉日期范围后的文本）
  - 测试辅助函数：`line(text | segments, size?)`、`lines(...items)`、`ZH_RESUME`、`EN_RESUME`

- [ ] **Step 1: 写测试辅助函数（虚构 fixture）**

`tests/helpers/lines.ts`：
```ts
import type { TextLine } from '@/shared/text-line';

type LineInput = string | readonly string[];

export function line(text: LineInput, size = 10): TextLine {
  return { page: 1, y: 0, size, segments: typeof text === 'string' ? [text] : text };
}

export const lines = (...items: LineInput[]): TextLine[] => items.map((t) => line(t));

/** 虚构中文简历，排版仿照常见单栏中文模板：右侧为日期或地点片段。 */
export const ZH_RESUME = lines(
  '李明',
  '13800138000 | liming@example.com',
  '教育背景',
  ['伦敦示例大学（Example University London）', '2025.09 – 2026.09'],
  ['数据科学 – 理学硕士（在读）', 'London, UK'],
  '• 核心课程：机器学习、统计推断',
  ['示例师范大学', '2021.09 – 2025.06'],
  ['软件工程 – 本科', '杭州，中国'],
  '• GPA：3.7/4.0，专业排名 前 10%',
  '项目经验',
  ['图像分类系统（导师：Prof. Alex Smith）', '2025.10 – 至今'],
  ['PyTorch · CNN · 图像分析', '团队项目'],
  '• 基于 PyTorch 构建 CNN 进行多类别分类，设计数据增强策略缓解样本不足问',
  '题，验证集准确率提升约 8%',
  '实习经验',
  ['示例计算中心 – AI 实习生（线上）', '2026.04 – 至今'],
  '• 参与图像识别算法研发',
  ['示例科技有限公司 – Java 后端开发实习生', '2023.07 – 2023.09'],
  '• 基于 Spring Boot 设计 RESTful API',
  '技能特长',
  '编程语言：Python、Java、SQL',
  'AI / ML：PyTorch、scikit-learn',
  '工具 / 工程：Git、Linux、MySQL',
  '语言：中文（母语）、英语（雅思 7，CET-6）',
  '荣誉奖项',
  '• 国家级创新项目负责人（2022–2024）',
  '• 省级程序设计竞赛三等奖 · 校一等奖学金',
);

/** 虚构英文简历。 */
export const EN_RESUME = lines(
  'Alex Chen',
  'alex.chen@example.com | +44 7700 900123 | linkedin.com/in/alexchen | github.com/alexchen',
  'EDUCATION',
  ['Example University', 'Sep 2024 – Jun 2025'],
  ['MSc Artificial Intelligence', 'Manchester, UK'],
  'EXPERIENCE',
  ['Acme Corp | Software Engineer Intern', 'Jun 2023 – Aug 2023'],
  '- Built REST APIs in Go',
  'PROJECTS',
  ['Chess Engine', '2022 – 2023'],
  ['Rust | WebAssembly', 'Individual'],
  '- Implemented alpha-beta search',
  'SKILLS',
  'Languages: Python, Rust, Go',
  'Tools: Docker, Git',
);
```

- [ ] **Step 2: 写失败测试**

`tests/parser/structure.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { entryTitle, isBullet, joinWrapped, mergeBullets, splitEntries, stripBullet } from '@/parser/entries';
import { headingKey, splitSections } from '@/parser/sections';
import { lineText } from '@/shared/text-line';
import { EN_RESUME, line, lines, ZH_RESUME } from '../helpers/lines';

describe('headingKey', () => {
  it.each([
    ['教育背景', 'education'],
    ['EDUCATION', 'education'],
    ['实习经验', 'experience'],
    ['Work Experience', 'experience'],
    ['项目经验', 'projects'],
    ['技能特长', 'skills'],
    ['Honors and Awards', 'awards'],
    ['自我评价', 'other'],
  ])('%s → %s', (text, key) => {
    expect(headingKey(line(text))).toBe(key);
  });

  it('ignores long lines and normal content', () => {
    expect(headingKey(line('教育背景以及其他很多很多很多很多很多很多很多很多的文字'))).toBeNull();
    expect(headingKey(line('参与项目开发'))).toBeNull();
  });
});

describe('splitSections', () => {
  it('splits the Chinese fixture into header and five sections', () => {
    const { header, sections } = splitSections(ZH_RESUME);
    expect(header.map(lineText)).toEqual(['李明', '13800138000 | liming@example.com']);
    expect(Object.keys(sections).sort()).toEqual(['awards', 'education', 'experience', 'projects', 'skills']);
    expect(sections.skills).toHaveLength(4);
  });

  it('appends repeated headings to the same section', () => {
    const { sections } = splitSections(lines('项目经验', 'A', '项目经历', 'B'));
    expect(sections.projects?.map(lineText)).toEqual(['A', 'B']);
  });
});

describe('bullets', () => {
  it('detects and strips bullet markers', () => {
    expect(isBullet('• 做了 A')).toBe(true);
    expect(isBullet('- Built X')).toBe(true);
    expect(isBullet('1. First')).toBe(true);
    expect(isBullet('3.8/4.0 GPA')).toBe(false);
    expect(isBullet('PyTorch · CNN')).toBe(false);
    expect(stripBullet('•  做了 A')).toBe('做了 A');
  });

  it('joins wrapped lines with a space only between latin words', () => {
    expect(joinWrapped('提升约', '8%')).toBe('提升约8%');
    expect(joinWrapped('Built REST', 'APIs')).toBe('Built REST APIs');
  });

  it('mergeBullets folds continuation lines into the previous item', () => {
    expect(mergeBullets(lines('• 第一条很长', '的续行', '• 第二条'))).toEqual(['第一条很长的续行', '第二条']);
  });
});

describe('splitEntries', () => {
  it('groups head, sub lines and wrapped bullets', () => {
    const { sections } = splitSections(ZH_RESUME);
    const { entries, orphans } = splitEntries(sections.projects ?? []);
    expect(orphans).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entryTitle(entries[0])).toBe('图像分类系统（导师：Prof. Alex Smith）');
    expect(entries[0].range).toMatchObject({ start: '2025-10', end: 'present' });
    expect(entries[0].subs.map(lineText)).toEqual(['PyTorch · CNN · 图像分析 团队项目']);
    expect(entries[0].bullets).toEqual([
      '基于 PyTorch 构建 CNN 进行多类别分类，设计数据增强策略缓解样本不足问题，验证集准确率提升约 8%',
    ]);
  });

  it('reports lines before the first entry as orphans', () => {
    const { entries, orphans } = splitEntries(lines('孤立的一行', ['Acme', '2020.01 - 2020.02']));
    expect(entries).toHaveLength(1);
    expect(orphans.map(lineText)).toEqual(['孤立的一行']);
  });

  it('handles the English fixture', () => {
    const { sections } = splitSections(EN_RESUME);
    const { entries } = splitEntries(sections.experience ?? []);
    expect(entries[0].bullets).toEqual(['Built REST APIs in Go']);
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/parser/structure.test.ts`
预期：FAIL（找不到模块）

- [ ] **Step 4: 实现**

`src/parser/sections.ts`：
```ts
import { lineText, type TextLine } from '@/shared/text-line';

export type SectionKey = 'education' | 'experience' | 'projects' | 'skills' | 'awards' | 'other';

const HEADINGS: Readonly<Record<SectionKey, readonly string[]>> = {
  education: ['教育背景', '教育经历', '教育', '学历', 'Education', 'Education Background', 'Academic Background'],
  experience: [
    '实习经验', '实习经历', '工作经验', '工作经历', '实践经历', '职业经历',
    'Experience', 'Work Experience', 'Professional Experience', 'Internships', 'Internship Experience', 'Employment',
  ],
  projects: ['项目经验', '项目经历', '科研经历', '科研项目', '项目', 'Projects', 'Project Experience', 'Research', 'Research Experience'],
  skills: ['技能特长', '专业技能', '技能', '技能证书', 'Skills', 'Technical Skills', 'Skills and Interests'],
  awards: ['荣誉奖项', '获奖情况', '获奖经历', '荣誉', '奖项', 'Awards', 'Honors', 'Honors and Awards', 'Awards and Honors', 'Achievements'],
  other: ['自我评价', '个人总结', '个人简介', '校园经历', '社会实践', '兴趣爱好', '论文', 'Summary', 'Profile', 'Interests', 'Publications'],
};

const MAX_HEADING_LENGTH = 24;

const normalize = (text: string) => text.toLowerCase().replace(/\band\b/g, '').replace(/[\s:：&＆、/|·•\-–—]/g, '');

const LOOKUP: ReadonlyMap<string, SectionKey> = new Map(
  (Object.entries(HEADINGS) as [SectionKey, readonly string[]][]).flatMap(([key, names]) =>
    names.map((name) => [normalize(name), key] as const),
  ),
);

export function headingKey(line: TextLine): SectionKey | null {
  const text = lineText(line).trim();
  if (text.length === 0 || text.length > MAX_HEADING_LENGTH) return null;
  return LOOKUP.get(normalize(text)) ?? null;
}

export function splitSections(lines: readonly TextLine[]): {
  header: TextLine[];
  sections: Partial<Record<SectionKey, TextLine[]>>;
} {
  const header: TextLine[] = [];
  const sections: Partial<Record<SectionKey, TextLine[]>> = {};
  let current: SectionKey | null = null;
  for (const line of lines) {
    const key = headingKey(line);
    if (key) {
      current = key;
      sections[key] = sections[key] ?? [];
    } else if (current) {
      sections[current]?.push(line);
    } else {
      header.push(line);
    }
  }
  return { header, sections };
}
```

`src/parser/entries.ts`：
```ts
import { lineText, type TextLine } from '@/shared/text-line';
import { type DateRange, findDateRange, removeRange } from './dates';

export interface Entry {
  head: TextLine;
  range: DateRange | null;
  subs: TextLine[];
  bullets: string[];
}

const BULLET = /^\s*(?:[•·▪●◦■□➢►*]|[-–](?=\s)|\d{1,2}[.)、](?=\s|[^\d]))\s*/;

export const isBullet = (text: string): boolean => BULLET.test(text);
export const stripBullet = (text: string): string => text.replace(BULLET, '').trim();

/** 换行续接：两侧都是拉丁字母或数字时补空格，中文直接拼接。 */
export function joinWrapped(prev: string, next: string): string {
  const needsSpace = /[A-Za-z0-9,.;:)]$/.test(prev) && /^[A-Za-z(]/.test(next);
  return needsSpace ? `${prev} ${next}` : `${prev}${next}`;
}

export function mergeBullets(lines: readonly TextLine[]): string[] {
  const items: string[] = [];
  for (const line of lines) {
    const text = lineText(line);
    if (isBullet(text) || items.length === 0) items.push(stripBullet(text));
    else items[items.length - 1] = joinWrapped(items[items.length - 1], text.trim());
  }
  return items.filter(Boolean);
}

export function entryTitle(entry: Entry): string {
  const text = lineText(entry.head);
  return entry.range ? removeRange(text, entry.range) : text.trim();
}

function appendLine(entry: Entry, line: TextLine): Entry {
  const text = lineText(line);
  if (isBullet(text)) return { ...entry, bullets: [...entry.bullets, stripBullet(text)] };
  if (entry.bullets.length > 0) {
    const last = entry.bullets[entry.bullets.length - 1];
    return { ...entry, bullets: [...entry.bullets.slice(0, -1), joinWrapped(last, text.trim())] };
  }
  return { ...entry, subs: [...entry.subs, line] };
}

/** 不以项目符号开头、且包含日期范围的行，视为一个新条目的头行。 */
export function splitEntries(lines: readonly TextLine[]): { entries: Entry[]; orphans: TextLine[] } {
  const entries: Entry[] = [];
  const orphans: TextLine[] = [];
  for (const line of lines) {
    const text = lineText(line);
    const range = isBullet(text) ? null : findDateRange(text);
    if (range) entries.push({ head: line, range, subs: [], bullets: [] });
    else if (entries.length === 0) orphans.push(line);
    else entries[entries.length - 1] = appendLine(entries[entries.length - 1], line);
  }
  return { entries, orphans };
}
```

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/parser`
预期：PASS

- [ ] **Step 6: Commit**

```bash
git add src/parser tests
git commit -m "feat: split resume text into sections and dated entries"
```

---

### Task 5: 各板块字段解析

**Files:**
- Create: `src/parser/header.ts`, `src/parser/education.ts`, `src/parser/experience.ts`, `src/parser/projects.ts`, `src/parser/skills.ts`, `src/parser/awards.ts`
- Test: `tests/parser/fields.test.ts`

**Interfaces:**
- Consumes: Task 3 和 Task 4 的全部函数；M1 中的 `Basic`、`Education`、`Experience`、`Project`、`Skills`、`Award` 类型
- Produces:
  - `parseHeader(header: readonly TextLine[], fullText: string): Parsed<Basic>`
  - `parseEducation(entries: readonly Entry[]): Parsed<Education[]>`
  - `parseExperience(entries): Parsed<Experience[]>`
  - `parseProjects(entries): Parsed<Project[]>`
  - `parseSkills(lines: readonly TextLine[]): Parsed<Skills>`
  - `parseAwards(lines: readonly TextLine[]): Parsed<Award[]>`
  - 警告 path 的格式为 `basic.name`、`education.0.degree` 这类点路径

- [ ] **Step 1: 写失败测试**

`tests/parser/fields.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { parseAwards } from '@/parser/awards';
import { parseEducation } from '@/parser/education';
import { splitEntries } from '@/parser/entries';
import { parseExperience } from '@/parser/experience';
import { parseHeader } from '@/parser/header';
import { parseProjects } from '@/parser/projects';
import { splitSections } from '@/parser/sections';
import { parseSkills } from '@/parser/skills';
import { lineText } from '@/shared/text-line';
import { EN_RESUME, lines, ZH_RESUME } from '../helpers/lines';

const zh = splitSections(ZH_RESUME);
const en = splitSections(EN_RESUME);
const entriesOf = (section: keyof typeof zh.sections, source = zh) => splitEntries(source.sections[section] ?? []).entries;
const fullText = (src: typeof ZH_RESUME) => src.map(lineText).join('\n');

describe('parseHeader', () => {
  it('reads name, phone and email', () => {
    const { value, warnings } = parseHeader(zh.header, fullText(ZH_RESUME));
    expect(value).toMatchObject({ name: '李明', phone: '13800138000', email: 'liming@example.com' });
    expect(warnings).toEqual([]);
  });

  it('reads English contacts and links', () => {
    const { value } = parseHeader(en.header, fullText(EN_RESUME));
    expect(value).toMatchObject({
      name: 'Alex Chen', phone: '+447700900123', email: 'alex.chen@example.com',
      linkedin: 'linkedin.com/in/alexchen', github: 'github.com/alexchen',
    });
  });

  it('falls back to the full text for contacts and warns on a missing name', () => {
    const { value, warnings } = parseHeader(lines('13900000000'), 'x 13900000000 y@example.com');
    expect(value).toMatchObject({ name: '', phone: '13900000000', email: 'y@example.com' });
    expect(warnings.map((w) => w.path)).toEqual(['basic.name']);
  });
});

describe('parseEducation', () => {
  it('parses Chinese education entries', () => {
    const { value } = parseEducation(entriesOf('education'));
    expect(value).toEqual([
      expect.objectContaining({
        school: '伦敦示例大学', schoolEn: 'Example University London', degree: 'master', major: '数据科学',
        start: '2025-09', end: '2026-09', courses: '机器学习、统计推断', city: 'London', country: 'UK',
      }),
      expect.objectContaining({
        school: '示例师范大学', degree: 'bachelor', major: '软件工程', start: '2021-09', end: '2025-06',
        gpa: '3.7/4.0', rank: '前10%', city: '杭州', country: '中国',
      }),
    ]);
  });

  it('parses English education and warns on unknown degree', () => {
    expect(parseEducation(entriesOf('education', en)).value[0]).toMatchObject({
      school: 'Example University', degree: 'master', major: 'Artificial Intelligence',
      start: '2024-09', end: '2025-06', city: 'Manchester', country: 'UK',
    });
    const { warnings } = parseEducation(splitEntries(lines(['某大学', '2020.09 - 2024.06'], '物理学')).entries);
    expect(warnings.map((w) => w.path)).toEqual(['education.0.degree']);
  });
});

describe('parseExperience', () => {
  it('splits company and title and detects internships', () => {
    const { value } = parseExperience(entriesOf('experience'));
    expect(value).toEqual([
      { company: '示例计算中心', title: 'AI 实习生（线上）', start: '2026-04', end: 'present', type: 'intern', bullets: ['参与图像识别算法研发'] },
      { company: '示例科技有限公司', title: 'Java 后端开发实习生', start: '2023-07', end: '2023-09', type: 'intern', bullets: ['基于 Spring Boot 设计 RESTful API'] },
    ]);
  });

  it('uses the first sub line as title when the head has no separator', () => {
    const { value } = parseExperience(splitEntries(lines(['Globex', '2020.01 - 2021.01'], 'Backend Engineer', '- Shipped X')).entries);
    expect(value[0]).toMatchObject({ company: 'Globex', title: 'Backend Engineer', type: 'fulltime', bullets: ['Shipped X'] });
  });

  it('parses English experience', () => {
    expect(parseExperience(entriesOf('experience', en)).value[0]).toMatchObject({
      company: 'Acme Corp', title: 'Software Engineer Intern', type: 'intern', start: '2023-06', end: '2023-08',
    });
  });
});

describe('parseProjects', () => {
  it('parses name, tech list, role and bullets', () => {
    const { value } = parseProjects(entriesOf('projects'));
    expect(value[0]).toMatchObject({
      name: '图像分类系统（导师：Prof. Alex Smith）', role: '团队项目',
      tech: ['PyTorch', 'CNN', '图像分析'], start: '2025-10', end: 'present',
    });
  });

  it('warns about approximate dates and treats long prose sub lines as bullets', () => {
    const { value, warnings } = parseProjects(entriesOf('projects', en));
    expect(value[0]).toMatchObject({ name: 'Chess Engine', tech: ['Rust', 'WebAssembly'], role: 'Individual' });
    expect(warnings.map((w) => w.path)).toEqual(['projects.0.start']);
    const prose = parseProjects(splitEntries(lines(['X', '2020.01 - 2020.02'], '这是一段很长的项目描述，没有任何技术栈分隔符，用来说明项目背景')).entries);
    expect(prose.value[0]).toMatchObject({ tech: [], bullets: ['这是一段很长的项目描述，没有任何技术栈分隔符，用来说明项目背景'] });
  });
});

describe('parseSkills', () => {
  it('classifies labelled skill lines', () => {
    expect(parseSkills(zh.sections.skills ?? []).value).toEqual({
      languages: ['Python', 'Java', 'SQL'],
      frameworks: ['PyTorch', 'scikit-learn'],
      tools: ['Git', 'Linux', 'MySQL'],
      langCerts: ['中文（母语）', '英语（雅思 7，CET-6）'],
    });
  });

  it('treats an English "Languages" line with programming languages as languages', () => {
    expect(parseSkills(en.sections.skills ?? []).value).toMatchObject({
      languages: ['Python', 'Rust', 'Go'], tools: ['Docker', 'Git'],
    });
  });

  it('puts unknown labels into tools with a warning', () => {
    const { value, warnings } = parseSkills(lines('爱好：篮球'));
    expect(value.tools).toEqual(['篮球']);
    expect(warnings).toHaveLength(1);
  });
});

describe('parseAwards', () => {
  it('splits award items and detects level', () => {
    expect(parseAwards(zh.sections.awards ?? []).value).toEqual([
      { name: '国家级创新项目负责人（2022–2024）', date: undefined, level: '国家级' },
      { name: '省级程序设计竞赛三等奖', date: undefined, level: '省级' },
      { name: '校一等奖学金', date: undefined, level: undefined },
    ]);
  });

  it('records a month when present', () => {
    expect(parseAwards(lines('• 优秀毕业生 2025.06')).value[0].date).toBe('2025-06');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/parser/fields.test.ts`
预期：FAIL（找不到模块）

- [ ] **Step 3: 实现**

`src/parser/header.ts`：
```ts
import type { Basic } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { extractContacts } from './contacts';
import { type Parsed, warnings } from './types';

const NAME_SPLIT = /\s*[|｜·•]\s*/;

const isName = (text: string) => text.length >= 2 && text.length <= 40 && !/[\d@:：/]/.test(text);

/** 姓名取首行的第一个片段；联系方式先在页眉找，找不到再在全文中找。 */
export function parseHeader(header: readonly TextLine[], fullText: string): Parsed<Basic> {
  const candidate = header[0]?.segments[0]?.split(NAME_SPLIT)[0]?.trim() ?? '';
  const name = isName(candidate) ? candidate : '';
  const local = extractContacts(header.map(lineText).join(' | '));
  const global = extractContacts(fullText);
  const contacts = { ...global, ...local };
  const value: Basic = {
    name,
    phone: contacts.phone ?? '',
    email: contacts.email ?? '',
    linkedin: contacts.linkedin,
    github: contacts.github,
    website: contacts.website,
  };
  return {
    value,
    warnings: warnings([
      [!name, 'basic.name', '未识别到姓名'],
      [!value.phone, 'basic.phone', '未识别到手机号'],
      [!value.email, 'basic.email', '未识别到邮箱'],
    ]),
  };
}
```

`src/parser/education.ts`：
```ts
import type { Education } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { detectDegree, stripDegree } from './degree';
import { type Entry, entryTitle } from './entries';
import { splitLocation, splitTrailing } from './text';
import { type Parsed, warnings } from './types';

const SCHOOL_EN = /^(.+?)\s*[（(]\s*([A-Za-z][^）)]*?)\s*[）)]\s*$/;
const COURSES = /^(?:核心课程|主修课程|主要课程|相关课程|courses?|relevant coursework|core modules|modules)\s*[:：]\s*(.+)$/i;
const GPA = /\bGPA\s*[:：]?\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)/i;
const RANK = /(?:专业排名|排名|rank(?:ing)?)\s*[:：]?\s*(前?\s*\d+(?:\.\d+)?\s*%|\d+\s*\/\s*\d+)/i;

function splitSchool(text: string): { school: string; schoolEn?: string } {
  const match = SCHOOL_EN.exec(text);
  return match ? { school: match[1].trim(), schoolEn: match[2].trim() } : { school: text };
}

function parseEntry(entry: Entry, index: number): Parsed<Education> {
  const title = entryTitle(entry);
  const [left, right] = entry.subs[0] ? splitTrailing(entry.subs[0]) : ['', undefined];
  const all = [lineText(entry.head), ...entry.subs.map(lineText), ...entry.bullets].join(' ');
  const value: Education = {
    ...splitSchool(title),
    degree: detectDegree(`${left} ${title}`),
    major: stripDegree(left),
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    gpa: GPA.exec(all)?.[1]?.replace(/\s+/g, ''),
    rank: RANK.exec(all)?.[1]?.replace(/\s+/g, ''),
    courses: entry.bullets.map((b) => COURSES.exec(b)?.[1]).find(Boolean),
    ...(right ? splitLocation(right) : {}),
  };
  const base = `education.${index}`;
  return {
    value,
    warnings: warnings([
      [!value.school, `${base}.school`, '未识别到学校名称'],
      [!value.degree, `${base}.degree`, '未识别到学历，请手动选择'],
      [Boolean(value.degree) && !value.major, `${base}.major`, '未识别到专业'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseEducation(entries: readonly Entry[]): Parsed<Education[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
```

`src/parser/experience.ts`：
```ts
import type { Experience } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { type Entry, entryTitle } from './entries';
import { splitOnce } from './text';
import { type Parsed, warnings } from './types';

const TITLE_SEPARATOR = /\s+[–—-]\s+|\s*[|｜]\s*/;
const INTERN = /实习|intern/i;

function parseEntry(entry: Entry, index: number): Parsed<Experience> {
  const title = entryTitle(entry);
  const split = splitOnce(title, TITLE_SEPARATOR);
  const [company, role] = split ?? [title, entry.subs[0] ? lineText(entry.subs[0]) : ''];
  const extraSubs = split ? entry.subs : entry.subs.slice(1);
  const value: Experience = {
    company,
    title: role,
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    type: INTERN.test(`${company} ${role}`) ? 'intern' : 'fulltime',
    bullets: [...extraSubs.map(lineText), ...entry.bullets],
  };
  const base = `experience.${index}`;
  return {
    value,
    warnings: warnings([
      [!company, `${base}.company`, '未识别到公司名称'],
      [!role, `${base}.title`, '未识别到职位'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseExperience(entries: readonly Entry[]): Parsed<Experience[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
```

`src/parser/projects.ts`：
```ts
import type { Project } from '@/shared/schema/profile';
import { lineText } from '@/shared/text-line';
import { type Entry, entryTitle } from './entries';
import { splitTrailing } from './text';
import { type Parsed, warnings } from './types';

const TECH_SEPARATOR = /\s*[·•|｜、/]\s*/;
const MAX_BARE_TECH_LENGTH = 30;
const ROLE_HINT = /负责人|成员|组长|队长|个人项目|团队项目|\blead\b|\bmember\b|\bowner\b|\bindividual\b|\bteam\b/i;

/** 副行如果是用分隔符列出的短语，或者是很短的一段文字，就当作技术栈；否则当作描述。 */
function isTechLine(text: string): boolean {
  return TECH_SEPARATOR.test(text) || text.length <= MAX_BARE_TECH_LENGTH;
}

function parseEntry(entry: Entry, index: number): Parsed<Project> {
  const [left, right] = entry.subs[0] ? splitTrailing(entry.subs[0]) : ['', undefined];
  const techLine = left !== '' && isTechLine(left);
  const value: Project = {
    name: entryTitle(entry),
    role: right && ROLE_HINT.test(right) ? right : undefined,
    start: entry.range?.start ?? '',
    end: entry.range?.end ?? '',
    tech: techLine ? left.split(TECH_SEPARATOR).map((s) => s.trim()).filter(Boolean) : [],
    bullets: [...entry.subs.slice(techLine ? 1 : 0).map(lineText), ...entry.bullets],
  };
  const base = `projects.${index}`;
  return {
    value,
    warnings: warnings([
      [!value.name, `${base}.name`, '未识别到项目名称'],
      [Boolean(entry.range?.approximate), `${base}.start`, '只识别到年份，月份为估计值'],
    ]),
  };
}

export function parseProjects(entries: readonly Entry[]): Parsed<Project[]> {
  const results = entries.map(parseEntry);
  return { value: results.map((r) => r.value), warnings: results.flatMap((r) => r.warnings) };
}
```

`src/parser/skills.ts`：
```ts
import type { Skills } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { stripBullet } from './entries';
import { splitList } from './text';
import type { ParseWarning, Parsed } from './types';

const LABEL = /^([^：:]{1,24})[：:]\s*(.+)$/;
const PROGRAMMING = /^(python|java|c|c\+\+|c#|go|golang|rust|javascript|typescript|sql|kotlin|swift|r|matlab|scala|php|ruby)$/i;

const RULES: readonly (readonly [keyof Skills, RegExp])[] = [
  ['languages', /编程|开发语言|programming|coding/i],
  ['tools', /工具|工程|平台|数据库|运维|tool|platform|database|devops|cloud/i],
  ['frameworks', /框架|库|\bAI\b|\bML\b|机器学习|深度学习|framework|librar/i],
  ['langCerts', /语言|外语|证书|language|certif/i],
];

function classify(label: string, values: readonly string[]): keyof Skills | null {
  const key = RULES.find(([, re]) => re.test(label))?.[0] ?? null;
  if (key === 'langCerts' && values.some((v) => PROGRAMMING.test(v))) return 'languages';
  return key;
}

const EMPTY: Skills = { languages: [], frameworks: [], tools: [], langCerts: [] };

export function parseSkills(lines: readonly TextLine[]): Parsed<Skills> {
  const texts = lines.map((l) => stripBullet(lineText(l))).filter(Boolean);
  return texts.reduce<Parsed<Skills>>(
    (acc, text) => {
      const match = LABEL.exec(text);
      const values = splitList(match ? match[2] : text);
      const key = match ? classify(match[1], values) : null;
      const target = key ?? 'tools';
      const warning: ParseWarning[] = match && !key
        ? [{ path: 'skills.tools', message: `未知技能分类「${match[1].trim()}」，已归入工具` }]
        : [];
      return {
        value: { ...acc.value, [target]: [...acc.value[target], ...values] },
        warnings: [...acc.warnings, ...warning],
      };
    },
    { value: EMPTY, warnings: [] },
  );
}
```

`src/parser/awards.ts`：
```ts
import type { Award } from '@/shared/schema/profile';
import type { TextLine } from '@/shared/text-line';
import { findMonth } from './dates';
import { mergeBullets } from './entries';
import type { Parsed } from './types';

const ITEM_SPLIT = /\s+·\s+|\s*[；;]\s*/;
const LEVEL = /(国家级|省级|市级|校级|院级|international|national|provincial)/i;

const toAward = (text: string): Award => ({ name: text, date: findMonth(text), level: LEVEL.exec(text)?.[1] });

export function parseAwards(lines: readonly TextLine[]): Parsed<Award[]> {
  const items = mergeBullets(lines)
    .flatMap((text) => text.split(ITEM_SPLIT))
    .map((s) => s.trim())
    .filter(Boolean);
  return { value: items.map(toAward), warnings: [] };
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/parser`
预期：PASS。规则细节导致个别用例不过时，修改实现（用例就是规格），并在报告中说明。

- [ ] **Step 5: Commit**

```bash
git add src/parser tests/parser
git commit -m "feat: parse header, education, experience, projects, skills and awards"
```

---

### Task 6: 组装 parseResume 和合并策略

**Files:**
- Create: `src/parser/parse-resume.ts`, `src/parser/merge.ts`
- Test: `tests/parser/parse-resume.test.ts`

**Interfaces:**
- Consumes: Task 3 到 Task 5 的全部函数、M1 的 `emptyProfile`、`ProfileSchema`
- Produces:
  - `parseResume(lines: readonly TextLine[]): ParseResult`
  - `mergeParsed(current: Profile, parsed: Profile): Profile`：基本信息中解析出的非空字段覆盖现有值；教育、经历、项目、奖项列表，以及技能下的各个子列表，解析结果非空时整体替换；求职偏好和自定义字段保留现有值

- [ ] **Step 1: 写失败测试**

`tests/parser/parse-resume.test.ts`：
```ts
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { mergeParsed } from '@/parser/merge';
import { parseResume } from '@/parser/parse-resume';
import { emptyEducation, emptyProfile, ProfileSchema } from '@/shared/schema/profile';
import { EN_RESUME, lines, ZH_RESUME } from '../helpers/lines';

describe('parseResume', () => {
  it('produces a schema-valid profile from the Chinese fixture', () => {
    const result = parseResume(ZH_RESUME);
    expect(v.safeParse(ProfileSchema, result.profile).success).toBe(true);
    expect(result.profile.basic.name).toBe('李明');
    expect(result.profile.education).toHaveLength(2);
    expect(result.profile.experience).toHaveLength(2);
    expect(result.profile.projects).toHaveLength(1);
    expect(result.profile.awards).toHaveLength(3);
    expect(result.warnings).toEqual([]);
    expect(result.text.split('\n')[0]).toBe('李明');
  });

  it('produces a schema-valid profile from the English fixture', () => {
    const result = parseResume(EN_RESUME);
    expect(v.safeParse(ProfileSchema, result.profile).success).toBe(true);
    expect(result.profile.skills.languages).toEqual(['Python', 'Rust', 'Go']);
  });

  it('warns when no section headings are found and about orphan lines', () => {
    const none = parseResume(lines('张三', '一些无法识别的内容'));
    expect(none.warnings.map((w) => w.path)).toContain('sections');
    const orphan = parseResume(lines('张三', '教育背景', '孤立行', ['某大学', '2020.09 - 2024.06'], '物理学 本科'));
    expect(orphan.warnings.map((w) => w.path)).toContain('education');
  });
});

describe('mergeParsed', () => {
  it('overrides non-empty basic fields and replaces non-empty lists only', () => {
    const base = emptyProfile();
    const current = {
      ...base,
      basic: { ...base.basic, name: '旧名', phone: '13000000000', idNumber: 'X1' },
      education: [{ ...emptyEducation(), school: '旧学校' }],
      skills: { ...base.skills, tools: ['Vim'] },
      preferences: { ...base.preferences, expectedCities: ['上海'] },
      custom: { 是否接受调剂: '是' },
    };
    const parsed = {
      ...base,
      basic: { ...base.basic, name: '新名', phone: '', email: 'new@example.com' },
      skills: { ...base.skills, languages: ['Go'] },
    };
    const merged = mergeParsed(current, parsed);
    expect(merged.basic).toMatchObject({ name: '新名', phone: '13000000000', email: 'new@example.com', idNumber: 'X1' });
    expect(merged.education).toEqual(current.education);
    expect(merged.skills).toEqual({ ...base.skills, languages: ['Go'], tools: ['Vim'] });
    expect(merged.preferences).toEqual(current.preferences);
    expect(merged.custom).toEqual(current.custom);
    expect(current.basic.name).toBe('旧名');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/parser/parse-resume.test.ts`
预期：FAIL（找不到模块）

- [ ] **Step 3: 实现**

`src/parser/parse-resume.ts`：
```ts
import { emptyProfile } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { parseAwards } from './awards';
import { parseEducation } from './education';
import { type Entry, splitEntries } from './entries';
import { parseExperience } from './experience';
import { parseHeader } from './header';
import { parseProjects } from './projects';
import { type SectionKey, splitSections } from './sections';
import { parseSkills } from './skills';
import type { ParseResult, ParseWarning } from './types';

type EntrySection = Extract<SectionKey, 'education' | 'experience' | 'projects'>;

function entriesOf(
  sections: Partial<Record<SectionKey, TextLine[]>>,
  key: EntrySection,
): { entries: Entry[]; warnings: ParseWarning[] } {
  const { entries, orphans } = splitEntries(sections[key] ?? []);
  const warnings = orphans.length > 0 ? [{ path: key, message: '部分内容未能归入条目，请对照原文检查' }] : [];
  return { entries, warnings };
}

export function parseResume(lines: readonly TextLine[]): ParseResult {
  const text = lines.map(lineText).join('\n');
  const { header, sections } = splitSections(lines);
  const basic = parseHeader(header, text);
  const edu = entriesOf(sections, 'education');
  const exp = entriesOf(sections, 'experience');
  const proj = entriesOf(sections, 'projects');
  const education = parseEducation(edu.entries);
  const experience = parseExperience(exp.entries);
  const projects = parseProjects(proj.entries);
  const skills = parseSkills(sections.skills ?? []);
  const awards = parseAwards(sections.awards ?? []);
  const noSections: ParseWarning[] = Object.keys(sections).length === 0
    ? [{ path: 'sections', message: '未识别到任何板块标题，解析结果可能不完整' }]
    : [];
  return {
    profile: {
      ...emptyProfile(),
      basic: basic.value,
      education: education.value,
      experience: experience.value,
      projects: projects.value,
      skills: skills.value,
      awards: awards.value,
    },
    warnings: [
      ...noSections, ...basic.warnings,
      ...edu.warnings, ...education.warnings,
      ...exp.warnings, ...experience.warnings,
      ...proj.warnings, ...projects.warnings,
      ...skills.warnings, ...awards.warnings,
    ],
    text,
  };
}
```

`src/parser/merge.ts`：
```ts
import type { Basic, Profile, Skills } from '@/shared/schema/profile';

const pick = <T>(next: readonly T[], prev: readonly T[]): T[] => (next.length > 0 ? [...next] : [...prev]);

function nonEmpty(basic: Basic): Partial<Basic> {
  return Object.fromEntries(
    Object.entries(basic).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  ) as Partial<Basic>;
}

function mergeSkills(current: Skills, parsed: Skills): Skills {
  return {
    languages: pick(parsed.languages, current.languages),
    frameworks: pick(parsed.frameworks, current.frameworks),
    tools: pick(parsed.tools, current.tools),
    langCerts: pick(parsed.langCerts, current.langCerts),
  };
}

/** 合并策略：基本信息中解析到的非空字段覆盖；列表只在解析结果非空时整体替换；求职偏好和自定义字段始终保留。 */
export function mergeParsed(current: Profile, parsed: Profile): Profile {
  return {
    ...current,
    basic: { ...current.basic, ...nonEmpty(parsed.basic) },
    education: pick(parsed.education, current.education),
    experience: pick(parsed.experience, current.experience),
    projects: pick(parsed.projects, current.projects),
    awards: pick(parsed.awards, current.awards),
    skills: mergeSkills(current.skills, parsed.skills),
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/parser && npm run compile`
预期：PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser tests/parser
git commit -m "feat: assemble resume parser and merge strategy"
```

---

### Task 7: importResume 编排

**Files:**
- Create: `src/import/import-resume.ts`
- Test: `tests/import/import-resume.test.ts`

**Interfaces:**
- Consumes: `detectKind`、`extractLines`（Task 2）、`ImportError`（Task 2）、`parseResume`（Task 6）、`bytesToBase64`（M1）、`MAX_RESUME_BYTES`、`RESUME_MIMES`、`ResumeFile`
- Produces:
  - `interface ImportResult { parse: ParseResult; file: ResumeFile }`
  - `importResume(file: File, extract?: (file: File) => Promise<TextLine[]>): Promise<ImportResult>`

- [ ] **Step 1: 写失败测试**

`tests/import/import-resume.test.ts`：
```ts
import { describe, expect, it, vi } from 'vitest';
import { importResume } from '@/import/import-resume';
import { base64ToBytes } from '@/shared/base64';
import { MAX_RESUME_BYTES } from '@/shared/constants';
import { ZH_RESUME } from '../helpers/lines';

const pdf = (bytes: Uint8Array | string = 'pdf-bytes') => new File([bytes], 'cv.pdf', { type: 'application/pdf' });

describe('importResume', () => {
  it('parses lines and encodes the original file', async () => {
    const result = await importResume(pdf(), async () => ZH_RESUME);
    expect(result.parse.profile.basic.name).toBe('李明');
    expect(result.file).toMatchObject({ name: 'cv.pdf', mime: 'application/pdf' });
    expect(new TextDecoder().decode(base64ToBytes(result.file.dataBase64))).toBe('pdf-bytes');
  });

  it('rejects unsupported types before extracting', async () => {
    const extract = vi.fn();
    await expect(importResume(new File(['x'], 'cv.txt'), extract)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit', async () => {
    await expect(importResume(pdf(new Uint8Array(MAX_RESUME_BYTES + 1)), async () => ZH_RESUME))
      .rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('reports scanned documents without text as NO_TEXT', async () => {
    await expect(importResume(pdf(), async () => [])).rejects.toMatchObject({ code: 'NO_TEXT' });
  });

  it('maps extraction failures to READ_FAILED and logs the cause', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(importResume(pdf(), async () => { throw new Error('bad pdf'); }))
      .rejects.toMatchObject({ code: 'READ_FAILED' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/import`
预期：FAIL（找不到模块）

- [ ] **Step 3: 实现**

`src/import/import-resume.ts`：
```ts
import { detectKind, extractLines } from '@/extract/index';
import { parseResume } from '@/parser/parse-resume';
import type { ParseResult } from '@/parser/types';
import { bytesToBase64 } from '@/shared/base64';
import { MAX_RESUME_BYTES, RESUME_MIMES } from '@/shared/constants';
import type { ResumeFile } from '@/shared/schema/vault-data';
import type { TextLine } from '@/shared/text-line';
import { ImportError } from './errors';

export interface ImportResult {
  parse: ParseResult;
  file: ResumeFile;
}

export async function importResume(
  file: File,
  extract: (file: File) => Promise<TextLine[]> = extractLines,
): Promise<ImportResult> {
  const kind = detectKind(file);
  if (!kind) throw new ImportError('UNSUPPORTED_TYPE');
  if (file.size > MAX_RESUME_BYTES) throw new ImportError('TOO_LARGE');
  const lines = await extract(file).catch((error: unknown) => {
    console.error('[ResumeSub] resume extraction failed', error);
    throw new ImportError('READ_FAILED');
  });
  if (lines.length === 0) throw new ImportError('NO_TEXT');
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    parse: parseResume(lines),
    file: { name: file.name, mime: RESUME_MIMES[kind], dataBase64: bytesToBase64(bytes) },
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/import && npm run compile`
预期：PASS（5 个测试）

- [ ] **Step 5: Commit**

```bash
git add src/import tests/import
git commit -m "feat: orchestrate local resume import with size and type checks"
```

---

### Task 8: 导入与校对 UI

**Files:**
- Create: `src/entrypoints/options/ResumeImport.tsx`, `src/entrypoints/options/ReviewView.tsx`
- Modify: `src/entrypoints/options/ProfileEditor.tsx`（`Props` 增加 `saveLabel?: string`，默认值 `'加密保存'`，用作保存按钮的文字）、`src/entrypoints/options/App.tsx`、`src/ui/base.css`
- Test: `tests/options/import-flow.test.tsx`

**Interfaces:**
- Consumes: `importResume`、`ImportResult`（Task 7）、`ImportError`、`mergeParsed`（Task 6）、`ParseWarning`、`call`、`ProfileEditor`
- Produces:
  - `<ResumeImport onImported={(result: ImportResult) => void} />`
  - `<ReviewView current imported onDone={(profile) => void} onCancel />`
  - `describeWarning(w: ParseWarning): string`

- [ ] **Step 1: 写失败测试**

`tests/options/import-flow.test.tsx`：
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/options/App';
import { describeWarning } from '@/entrypoints/options/ReviewView';
import { ImportError } from '@/import/errors';
import { importResume } from '@/import/import-resume';
import { call } from '@/shared/client';
import { emptyProfile } from '@/shared/schema/profile';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));
vi.mock('@/import/import-resume', () => ({ importResume: vi.fn() }));

const mockCall = vi.mocked(call);
const mockImport = vi.mocked(importResume);
const FILE = { name: 'cv.pdf', mime: 'application/pdf' as const, dataBase64: 'JVBERi0=' };

function parsedProfile() {
  const base = emptyProfile();
  return { ...base, basic: { ...base.basic, name: '李明', email: 'liming@example.com' } };
}

function backend(saved: unknown[]) {
  mockCall.mockImplementation((async (req: { type: string; profile?: unknown; file?: unknown }) => {
    if (req.type === 'profile.get') return emptyProfile();
    if (req.type === 'prefs.get') return { autoLockMinutes: 60 };
    if (req.type === 'resume.import') { saved.push({ profile: req.profile, file: req.file }); return null; }
    throw new Error(`unexpected ${req.type}`);
  }) as never);
}

async function chooseFile() {
  const input = (await screen.findByLabelText('选择简历文件')) as HTMLInputElement;
  const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  mockCall.mockReset();
  mockImport.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('describeWarning', () => {
  it('names the section and item position', () => {
    expect(describeWarning({ path: 'education.0.degree', message: '未识别到学历' })).toBe('教育经历 第 1 条：未识别到学历');
    expect(describeWarning({ path: 'basic.name', message: '未识别到姓名' })).toBe('基本信息：未识别到姓名');
    expect(describeWarning({ path: 'sections', message: 'x' })).toBe('整体：x');
  });
});

describe('import flow', () => {
  it('parses, reviews and saves profile with the original file', async () => {
    const saved: unknown[] = [];
    backend(saved);
    mockImport.mockResolvedValue({
      parse: {
        profile: parsedProfile(),
        warnings: [{ path: 'basic.phone', message: '未识别到手机号' }],
        text: '李明\nliming@example.com',
      },
      file: FILE,
    });
    render(<App />);
    await chooseFile();
    await screen.findByText('确认导入并加密保存');
    expect(screen.getByText('基本信息：未识别到手机号')).toBeTruthy();
    expect(screen.getByLabelText('简历原文').textContent).toContain('liming@example.com');
    expect((screen.getByLabelText('姓名') as HTMLInputElement).value).toBe('李明');
    fireEvent.click(screen.getByText('确认导入并加密保存'));
    await screen.findByLabelText('选择简历文件');
    expect(saved).toEqual([{ profile: parsedProfile(), file: FILE }]);
    expect((screen.getByLabelText('姓名') as HTMLInputElement).value).toBe('李明');
  });

  it('shows import errors and stays on the editor', async () => {
    backend([]);
    mockImport.mockRejectedValue(new ImportError('NO_TEXT'));
    render(<App />);
    await chooseFile();
    await screen.findByText(/未识别到文字/);
    expect(screen.queryByText('确认导入并加密保存')).toBeNull();
  });

  it('cancel returns to the editor without saving', async () => {
    const saved: unknown[] = [];
    backend(saved);
    mockImport.mockResolvedValue({ parse: { profile: parsedProfile(), warnings: [], text: '李明' }, file: FILE });
    render(<App />);
    await chooseFile();
    fireEvent.click(await screen.findByText('放弃导入'));
    await waitFor(() => expect(screen.queryByText('确认导入并加密保存')).toBeNull());
    expect(saved).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/options/import-flow.test.tsx`
预期：FAIL（找不到 ReviewView 模块）

- [ ] **Step 3: 实现**

`src/entrypoints/options/ResumeImport.tsx`：
```tsx
import { useState } from 'preact/hooks';
import { ImportError } from '@/import/errors';
import { type ImportResult, importResume } from '@/import/import-resume';
import { RESUME_MIMES } from '@/shared/constants';

const ACCEPT = ['.pdf', '.docx', RESUME_MIMES.pdf, RESUME_MIMES.docx].join(',');

const importErrorText = (error: unknown) => (error instanceof ImportError ? error.message : '解析失败，请重试');

export function ResumeImport({ onImported }: { onImported: (result: ImportResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handle = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onImported(await importResume(file));
    } catch (e) {
      setError(importErrorText(e));
    } finally {
      setBusy(false);
      input.value = '';
    }
  };

  return (
    <section>
      <h2>导入简历</h2>
      <p class="hint">支持 PDF / DOCX。解析全程在本地完成，不会上传；导入会覆盖解析到的字段，请先保存正在编辑的内容。</p>
      <input type="file" aria-label="选择简历文件" accept={ACCEPT} disabled={busy}
        onChange={(e) => void handle(e.currentTarget)} />
      {busy && <p>解析中…</p>}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
```

`src/entrypoints/options/ReviewView.tsx`：
```tsx
import { useMemo } from 'preact/hooks';
import type { ImportResult } from '@/import/import-resume';
import { mergeParsed } from '@/parser/merge';
import type { ParseWarning } from '@/parser/types';
import { call } from '@/shared/client';
import type { Profile } from '@/shared/schema/profile';
import { ProfileEditor } from './ProfileEditor';

const SECTION_NAMES: Readonly<Record<string, string>> = {
  basic: '基本信息',
  education: '教育经历',
  experience: '实习 / 工作经历',
  projects: '项目经历',
  skills: '技能',
  awards: '荣誉奖项',
};

export function describeWarning({ path, message }: ParseWarning): string {
  const [section, index] = path.split('.');
  const name = SECTION_NAMES[section] ?? '整体';
  const position = index !== undefined && /^\d+$/.test(index) ? ` 第 ${Number(index) + 1} 条` : '';
  return `${name}${position}：${message}`;
}

interface Props {
  current: Profile;
  imported: ImportResult;
  onDone: (profile: Profile) => void;
  onCancel: () => void;
}

export function ReviewView({ current, imported, onDone, onCancel }: Props) {
  const merged = useMemo(() => mergeParsed(current, imported.parse.profile), [current, imported]);
  const { warnings, text } = imported.parse;

  const save = async (profile: Profile) => {
    await call({ type: 'resume.import', profile, file: imported.file });
    onDone(profile);
  };

  return (
    <div>
      <h2>校对解析结果</h2>
      <p class="hint">左侧为简历原文，右侧为解析结果（已与现有档案合并）。核对无误后保存。</p>
      {warnings.length > 0 && (
        <ul class="warn">
          {warnings.map((w, i) => <li key={i}>{describeWarning(w)}</li>)}
        </ul>
      )}
      <div class="review">
        <pre class="raw" aria-label="简历原文">{text}</pre>
        <ProfileEditor initial={merged} onSave={save} saveLabel="确认导入并加密保存" />
      </div>
      <button type="button" onClick={onCancel}>放弃导入</button>
    </div>
  );
}
```

`src/entrypoints/options/ProfileEditor.tsx`：`Props` 增加 `saveLabel?: string`，签名改为 `ProfileEditor({ initial, onSave, saveLabel = '加密保存' }: Props)`，保存按钮的文字改成 `{saveLabel}`。

`src/entrypoints/options/App.tsx`：
- 在 `View` 联合类型中加入 `| { kind: 'review'; profile: Profile; imported: ImportResult }`，并 import `ImportResult`、`ResumeImport`、`ReviewView`
- `save` 改为在保存后更新视图，保证之后导入时合并的是最新档案：
```tsx
  const save = async (profile: Profile) => {
    await call({ type: 'profile.save', profile });
    setView({ kind: 'ready', profile });
  };
```
- ready 分支改为：
```tsx
      {view.kind === 'ready' && (
        <>
          <ResumeImport onImported={(imported) => setView({ kind: 'review', profile: view.profile, imported })} />
          <ProfileEditor initial={view.profile} onSave={save} />
          <PrefsForm />
        </>
      )}
      {view.kind === 'review' && (
        <ReviewView
          current={view.profile}
          imported={view.imported}
          onDone={(profile) => setView({ kind: 'ready', profile })}
          onCancel={() => setView({ kind: 'ready', profile: view.profile })}
        />
      )}
```

`src/ui/base.css` 末尾追加：
```css
.review { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
.raw { position: sticky; top: 0; max-height: 90vh; overflow: auto; white-space: pre-wrap; background: #f6f8fa; padding: 12px; border-radius: 8px; font-size: 12px; }
@media (max-width: 760px) { .review { grid-template-columns: 1fr; } .raw { position: static; max-height: 40vh; } }
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/options && npm run compile`
预期：PASS（新增 4 个测试，原有 options 测试仍然通过）

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add resume import and review screen to options page"
```

---

### Task 9: M2 验收

**Files:** 不新增文件（只有发现问题时才修改）

- [ ] **Step 1: 跑全部测试和覆盖率**

运行：`npm run coverage`
预期：全部测试 PASS，四项覆盖率都 ≥ 80%。如果不足，给覆盖率最低的文件补测试，不要降低阈值。

- [ ] **Step 2: 类型检查、构建、确认按需加载**

运行：`npm run compile && npm run build && ls -la .output/chrome-mv3 .output/chrome-mv3/chunks && grep -l "GlobalWorkerOptions" .output/chrome-mv3/*.js .output/chrome-mv3/chunks/*.js`
预期：
- 编译和构建都通过
- 包含 `GlobalWorkerOptions` 的文件只能是单独的 chunk，不能是 `background.js` 或 popup 的 chunk
- pdf worker 文件出现在输出目录中
- `manifest.json` 的权限仍然只有 `["storage","alarms"]`

- [ ] **Step 3: Commit（如果前面有修复）**

```bash
git add -A
git commit -m "test: M2 acceptance fixes"
```
