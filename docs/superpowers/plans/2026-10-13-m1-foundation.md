# ResumeSub M1 基础层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭好可加载的 MV3 扩展：主密码加密的本地 vault、类型安全的消息协议、popup 解锁界面、options 档案手动编辑页。

**Architecture:** WXT 构建扩展。Background service worker 是唯一接触明文档案的组件：vault 用 PBKDF2 派生密钥、AES-GCM 加密后存入 `storage.local`，解锁后的密钥放在 `storage.session`（只在内存中）。Popup 和 options 通过经 valibot 校验的消息与 background 通信，router 按发送方身份做接口白名单控制。

**Tech Stack:** WXT (MV3)、TypeScript、Preact、valibot、WebCrypto、Vitest + happy-dom + @testing-library/preact

**Spec:** `docs/superpowers/specs/2026-10-13-resume-autofill-extension-design.md`（本计划对应其中 §11 的 M1）

## Global Constraints

- Node ≥ 20（测试依赖全局 `crypto.subtle`）
- 加密参数：PBKDF2-SHA256 600000 次迭代、16 字节 salt、AES-256-GCM、12 字节 IV，每次写入使用新 IV
- 主密码至少 10 位；连续 5 次输错后冷却 30 秒；自动上锁可选 15、60 分钟或 0（直到关闭浏览器），默认 60
- 不申请 `<all_urls>`；M1 只申请 `storage` 和 `alarms` 权限
- 不使用 `eval` / `innerHTML` / 远程代码；不引入任何遥测
- 依赖只允许：preact、valibot（运行时）；wxt、typescript、vitest、@vitest/coverage-v8、happy-dom、@testing-library/preact（开发时）
- 单个文件不超过 400 行，函数不超过 50 行；采用不可变更新（spread / map / filter），不就地修改入参
- 测试数据只使用虚构信息，真实简历不进入仓库
- 覆盖率 ≥ 80%（不统计 `background.ts` 和 `main.tsx` 这类接线文件）
- UI 文案使用中文；commit 格式为 `<type>: <description>`

## File Structure

```
package.json / wxt.config.ts / tsconfig.json / vitest.config.ts / .gitignore
src/
  shared/
    constants.ts            加密参数、存储 key、限制值
    base64.ts               字节 ↔ base64
    immutable.ts            updateAt / removeAt
    schema/profile.ts       Profile 及子结构 schema + empty 工厂
    schema/vault-data.ts    VaultData schema + emptyVaultData
    schema/prefs.ts         Prefs schema + 默认值
    messages.ts             Request schema、Response、ResponseMap、VaultStatus
    client.ts               UI 侧 call() + ApiError + errorText
  background/
    storage.ts              KVArea 接口 + fromBrowserArea
    vault/errors.ts         VaultError
    vault/crypto.ts         deriveKey / sealVault / openVault / 原始密钥导入导出
    vault/vault.ts          createVault：setup/unlock/lock/read/write/status
    auto-lock.ts            createAutoLock + isAutoLockAlarm
    prefs.ts                createPrefs
    handlers.ts             dispatch(req) → 业务逻辑
    router.ts               classifySender + createRouter（校验 + 权限）
  ui/
    base.css
  entrypoints/
    background.ts           接线
    popup/{index.html, main.tsx, App.tsx, SetupForm.tsx, UnlockForm.tsx}
    options/{index.html, main.tsx, App.tsx, ProfileEditor.tsx, PrefsForm.tsx,
             fields.ts, FieldInput.tsx, LinesInput.tsx, ObjectForm.tsx,
             ListSection.tsx, CustomFields.tsx}
tests/
  helpers/memory-area.ts
  ...（每个模块对应一个 *.test.ts(x)）
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/entrypoints/background.ts`, `src/entrypoints/popup/index.html`, `src/entrypoints/popup/main.tsx`, `src/entrypoints/options/index.html`, `src/entrypoints/options/main.tsx`, `src/ui/base.css`
- Test: `tests/smoke.test.tsx`

**Interfaces:**
- Produces: 路径别名 `@/` → `src/`；`npm test`、`npm run compile`、`npm run build`、`npm run coverage` 四个脚本

- [ ] **Step 1: 初始化 git 和 package.json**

```bash
cd resumesub
git init
```

`package.json`：
```json
{
  "name": "resumesub",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "compile": "tsc --noEmit",
    "test": "vitest run",
    "coverage": "vitest run --coverage",
    "postinstall": "wxt prepare"
  }
}
```

`.gitignore`：
```
node_modules/
.output/
.wxt/
coverage/
```

- [ ] **Step 2: 写配置文件**

`wxt.config.ts`：
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'ResumeSub',
    description: '简历一键投递：本地加密档案 + 自动填写',
    permissions: ['storage', 'alarms'],
  },
  vite: () => ({
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  }),
});
```

`tsconfig.json`：
```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

`vitest.config.ts`：
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/entrypoints/background.ts', 'src/entrypoints/**/main.tsx', 'src/**/*.css', 'src/**/*.html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 3: 最小入口文件**

`src/entrypoints/background.ts`：
```ts
export default defineBackground(() => {});
```

`src/entrypoints/popup/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>ResumeSub</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/options/index.html`：
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="manifest.open_in_tab" content="true" />
    <title>ResumeSub 档案</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/entrypoints/popup/main.tsx` 和 `src/entrypoints/options/main.tsx`（两者暂时相同，Task 7 和 Task 9 会替换）：
```tsx
import { render } from 'preact';
import '@/ui/base.css';

render(<h1>ResumeSub</h1>, document.getElementById('app')!);
```

`src/ui/base.css`：
```css
:root { font: 14px/1.5 system-ui, -apple-system, 'PingFang SC', sans-serif; color: #1f2328; }
body { margin: 0; }
.popup { width: 300px; padding: 16px; }
.options { max-width: 880px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 18px; margin: 0 0 12px; }
h2 { font-size: 15px; margin: 20px 0 8px; }
label, .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
input, select, textarea { font: inherit; padding: 6px 8px; border: 1px solid #d0d7de; border-radius: 6px; }
button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #d0d7de; background: #f6f8fa; cursor: pointer; }
button[type='submit'], .primary { background: #1f6feb; color: #fff; border-color: #1f6feb; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0 12px; }
fieldset { border: 1px solid #d0d7de; border-radius: 8px; margin-bottom: 12px; }
.row { display: flex; gap: 8px; margin-bottom: 8px; }
.month { display: flex; gap: 8px; align-items: center; }
.error { color: #cf222e; }
.ok { color: #1a7f37; }
.warn { color: #9a6700; }
.hint { color: #57606a; font-size: 12px; }
```

- [ ] **Step 4: 安装依赖**

```bash
npm install preact valibot
npm install -D wxt typescript vitest @vitest/coverage-v8 happy-dom @testing-library/preact
```
预期：安装成功，`postinstall` 生成 `.wxt/tsconfig.json`。

- [ ] **Step 5: 写冒烟测试（验证 JSX 和 DOM 测试环境）**

`tests/smoke.test.tsx`：
```tsx
// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';

afterEach(cleanup);

it('renders preact JSX in happy-dom', () => {
  render(<p>ok</p>);
  expect(screen.getByText('ok')).toBeTruthy();
});
```

- [ ] **Step 6: 运行测试、类型检查和构建**

```bash
npm test && npm run compile && npm run build
```
预期：1 个测试通过；tsc 没有输出；生成 `.output/chrome-mv3/manifest.json`，其中 `permissions` 为 `["storage","alarms"]`。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold WXT + Preact extension"
```

---

### Task 2: 数据 schema

**Files:**
- Create: `src/shared/constants.ts`, `src/shared/schema/profile.ts`, `src/shared/schema/vault-data.ts`, `src/shared/schema/prefs.ts`
- Test: `tests/shared/schema.test.ts`

**Interfaces:**
- Produces:
  - `ProfileSchema`、`type Profile`、`type Basic | Education | Experience | Project | Skills | Award | Preferences`
  - `emptyProfile(): Profile`、`emptyEducation()`、`emptyExperience()`、`emptyProject()`、`emptyAward()`
  - `VaultDataSchema`、`type VaultData`、`emptyVaultData(): VaultData`
  - `PrefsSchema`、`type Prefs = { autoLockMinutes: 0 | 15 | 60 }`、`DEFAULT_PREFS`
  - `constants.ts` 中的全部常量（见下方代码）

- [ ] **Step 1: 写常量**

`src/shared/constants.ts`：
```ts
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000;
export const AUTO_LOCK_ALARM = 'vault-auto-lock';
export const VAULT_CHECK_TEXT = 'resumesub-vault-ok';

export const STORAGE_KEYS = {
  vault: 'vault',
  prefs: 'prefs',
  sessionKey: 'vaultKey',
  lockout: 'lockout',
} as const;
```

- [ ] **Step 2: 写失败测试**

`tests/shared/schema.test.ts`：
```ts
import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { emptyEducation, emptyProfile, ProfileSchema } from '@/shared/schema/profile';
import { emptyVaultData, VaultDataSchema } from '@/shared/schema/vault-data';
import { DEFAULT_PREFS, PrefsSchema } from '@/shared/schema/prefs';

describe('ProfileSchema', () => {
  it('accepts an empty profile', () => {
    expect(v.safeParse(ProfileSchema, emptyProfile()).success).toBe(true);
  });

  it('accepts YYYY-MM, present and empty dates', () => {
    const profile = {
      ...emptyProfile(),
      education: [
        { ...emptyEducation(), start: '2025-09', end: 'present' },
        { ...emptyEducation(), start: '', end: '' },
      ],
    };
    expect(v.safeParse(ProfileSchema, profile).success).toBe(true);
  });

  it('rejects malformed dates with a readable message', () => {
    const profile = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    const result = v.safeParse(ProfileSchema, profile);
    expect(result.success).toBe(false);
    expect(result.issues?.[0].message).toContain('YYYY-MM');
  });

  it('rejects malformed birthDate', () => {
    const profile = { ...emptyProfile(), basic: { ...emptyProfile().basic, birthDate: '2000/01/01' } };
    expect(v.safeParse(ProfileSchema, profile).success).toBe(false);
  });

  it('strips unknown keys', () => {
    const result = v.parse(ProfileSchema, { ...emptyProfile(), evil: 1 });
    expect(result).not.toHaveProperty('evil');
  });
});

describe('VaultDataSchema', () => {
  it('accepts empty vault data', () => {
    expect(v.safeParse(VaultDataSchema, emptyVaultData()).success).toBe(true);
  });

  it('rejects wrong version', () => {
    expect(v.safeParse(VaultDataSchema, { ...emptyVaultData(), version: 2 }).success).toBe(false);
  });
});

describe('PrefsSchema', () => {
  it('accepts defaults and rejects unsupported minutes', () => {
    expect(v.safeParse(PrefsSchema, DEFAULT_PREFS).success).toBe(true);
    expect(v.safeParse(PrefsSchema, { autoLockMinutes: 7 }).success).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/shared/schema.test.ts`
预期：FAIL，报错 `Cannot find module '@/shared/schema/profile'`

- [ ] **Step 4: 实现 schema**

`src/shared/schema/profile.ts`：
```ts
import * as v from 'valibot';

const YEAR_MONTH = /^(|\d{4}-(0[1-9]|1[0-2])|present)$/;
const DATE = /^(|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;

const yearMonth = () => v.pipe(v.string(), v.regex(YEAR_MONTH, '日期格式应为 YYYY-MM 或 present'));
const optText = () => v.optional(v.string());
const textList = () => v.array(v.string());

export const BasicSchema = v.object({
  name: v.string(),
  nameEn: optText(),
  phone: v.string(),
  email: v.string(),
  gender: optText(),
  birthDate: v.optional(v.pipe(v.string(), v.regex(DATE, '出生日期格式应为 YYYY-MM-DD'))),
  idType: optText(),
  idNumber: optText(),
  nationality: optText(),
  hometown: optText(),
  politicalStatus: optText(),
  currentCity: optText(),
  address: optText(),
  linkedin: optText(),
  github: optText(),
  website: optText(),
});

export const EducationSchema = v.object({
  school: v.string(),
  schoolEn: optText(),
  degree: v.string(),
  major: v.string(),
  start: yearMonth(),
  end: yearMonth(),
  gpa: optText(),
  rank: optText(),
  courses: optText(),
  city: optText(),
  country: optText(),
});

export const ExperienceSchema = v.object({
  company: v.string(),
  title: v.string(),
  start: yearMonth(),
  end: yearMonth(),
  type: v.picklist(['intern', 'fulltime']),
  location: optText(),
  bullets: textList(),
});

export const ProjectSchema = v.object({
  name: v.string(),
  role: optText(),
  start: yearMonth(),
  end: yearMonth(),
  tech: textList(),
  bullets: textList(),
});

export const SkillsSchema = v.object({
  languages: textList(),
  frameworks: textList(),
  tools: textList(),
  langCerts: textList(),
});

export const AwardSchema = v.object({ name: v.string(), date: optText(), level: optText() });

export const PreferencesSchema = v.object({
  expectedCities: textList(),
  expectedSalary: optText(),
  availableFrom: optText(),
  jobTypes: textList(),
});

export const ProfileSchema = v.object({
  basic: BasicSchema,
  education: v.array(EducationSchema),
  experience: v.array(ExperienceSchema),
  projects: v.array(ProjectSchema),
  skills: SkillsSchema,
  awards: v.array(AwardSchema),
  preferences: PreferencesSchema,
  custom: v.record(v.string(), v.string()),
});

export type Basic = v.InferOutput<typeof BasicSchema>;
export type Education = v.InferOutput<typeof EducationSchema>;
export type Experience = v.InferOutput<typeof ExperienceSchema>;
export type Project = v.InferOutput<typeof ProjectSchema>;
export type Skills = v.InferOutput<typeof SkillsSchema>;
export type Award = v.InferOutput<typeof AwardSchema>;
export type Preferences = v.InferOutput<typeof PreferencesSchema>;
export type Profile = v.InferOutput<typeof ProfileSchema>;

export const emptyEducation = (): Education => ({ school: '', degree: '', major: '', start: '', end: '' });
export const emptyExperience = (): Experience => ({
  company: '', title: '', start: '', end: '', type: 'intern', bullets: [],
});
export const emptyProject = (): Project => ({ name: '', start: '', end: '', tech: [], bullets: [] });
export const emptyAward = (): Award => ({ name: '' });

export function emptyProfile(): Profile {
  return {
    basic: { name: '', phone: '', email: '' },
    education: [],
    experience: [],
    projects: [],
    skills: { languages: [], frameworks: [], tools: [], langCerts: [] },
    awards: [],
    preferences: { expectedCities: [], jobTypes: [] },
    custom: {},
  };
}
```

`src/shared/schema/vault-data.ts`：
```ts
import * as v from 'valibot';
import { emptyProfile, ProfileSchema } from './profile';

export const AnswerSchema = v.object({
  id: v.string(),
  question: v.string(),
  answer: v.string(),
  lang: v.picklist(['zh', 'en']),
  tags: v.array(v.string()),
});

export const ResumeFileSchema = v.object({ name: v.string(), mime: v.string(), dataBase64: v.string() });

export const LlmSettingsSchema = v.object({
  provider: v.picklist(['anthropic', 'openai-compatible']),
  baseUrl: v.string(),
  model: v.string(),
  apiKey: v.string(),
});

export const SettingsSchema = v.object({
  llm: v.optional(LlmSettingsSchema),
  offlineMode: v.boolean(),
});

export const VaultDataSchema = v.object({
  version: v.literal(1),
  profile: ProfileSchema,
  answers: v.array(AnswerSchema),
  siteMappings: v.record(v.string(), v.record(v.string(), v.string())),
  resumeFile: v.optional(ResumeFileSchema),
  settings: SettingsSchema,
});

export type VaultData = v.InferOutput<typeof VaultDataSchema>;

export function emptyVaultData(): VaultData {
  return {
    version: 1,
    profile: emptyProfile(),
    answers: [],
    siteMappings: {},
    settings: { offlineMode: false },
  };
}
```

`src/shared/schema/prefs.ts`：
```ts
import * as v from 'valibot';

/** 不含敏感信息、上锁状态下也需要读取的偏好，明文存储。 */
export const PrefsSchema = v.object({
  autoLockMinutes: v.picklist([0, 15, 60]),
});

export type Prefs = v.InferOutput<typeof PrefsSchema>;

export const DEFAULT_PREFS: Prefs = { autoLockMinutes: 60 };
```

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/shared/schema.test.ts`
预期：PASS（8 个测试）

- [ ] **Step 6: Commit**

```bash
git add src/shared tests/shared
git commit -m "feat: add profile, vault data and prefs schemas"
```

---

### Task 3: 加密原语

**Files:**
- Create: `src/shared/base64.ts`, `src/background/vault/errors.ts`, `src/background/vault/crypto.ts`
- Test: `tests/shared/base64.test.ts`, `tests/background/crypto.test.ts`

**Interfaces:**
- Consumes: `IV_BYTES`、`VAULT_CHECK_TEXT`、`MIN_PASSWORD_LENGTH`、`LOCKOUT_MS`（Task 2）
- Produces:
  - `bytesToBase64(bytes: Uint8Array): string`、`base64ToBytes(b64: string): Uint8Array`
  - `type VaultErrorCode`、`class VaultError extends Error { readonly code: VaultErrorCode }`
  - `randomBytes(length: number): Uint8Array`
  - `deriveKey(password: string, salt: BufferSource, iterations: number): Promise<CryptoKey>`（可导出的 AES-GCM 密钥）
  - `type EncryptedBlob = { v: 1; salt: string; iterations: number; check: Sealed; data: Sealed }`，其中 `Sealed = { iv: string; ct: string }`
  - `sealVault(key, saltB64: string, iterations: number, data: unknown): Promise<EncryptedBlob>`
  - `openVault(key, blob): Promise<unknown>`：密钥错误时抛出 `WRONG_PASSWORD`，密文损坏时抛出 `CORRUPTED`
  - `parseBlob(raw: unknown): EncryptedBlob`：结构不合法时抛出 `CORRUPTED`
  - `exportRawKey(key): Promise<string>`、`importRawKey(b64): Promise<CryptoKey>`

> 设计说明：blob 中额外加密了一段固定文本 `check`。用它可以区分"密码错误"（check 解不开）和"数据损坏"（check 能解开但 data 解不开），这正是 spec §9 要求的两种不同提示。

- [ ] **Step 1: 写失败测试**

`tests/shared/base64.test.ts`：
```ts
import { expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';

it('roundtrips large byte arrays', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(100_000));
  expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
});

it('encodes known value', () => {
  expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
});
```

`tests/background/crypto.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import {
  deriveKey, exportRawKey, importRawKey, openVault, parseBlob, randomBytes, sealVault,
} from '@/background/vault/crypto';

const ITER = 1000;

async function makeKey(password = 'test-password-1') {
  const salt = bytesToBase64(randomBytes(16));
  return { salt, key: await deriveKey(password, base64ToBytes(salt), ITER) };
}

describe('vault crypto', () => {
  it('roundtrips JSON data', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, { hello: '世界' });
    expect(await openVault(key, blob)).toEqual({ hello: '世界' });
    expect(blob).toMatchObject({ v: 1, salt, iterations: ITER });
  });

  it('uses a fresh IV for every seal', async () => {
    const { key, salt } = await makeKey();
    const a = await sealVault(key, salt, ITER, 1);
    const b = await sealVault(key, salt, ITER, 1);
    expect(a.data.iv).not.toBe(b.data.iv);
    expect(a.check.iv).not.toBe(a.data.iv);
  });

  it('reports WRONG_PASSWORD for a different key', async () => {
    const { key, salt } = await makeKey('right-password');
    const blob = await sealVault(key, salt, ITER, {});
    const wrong = await deriveKey('wrong-password', base64ToBytes(salt), ITER);
    await expect(openVault(wrong, blob)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  it('reports CORRUPTED when data ciphertext is tampered', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, { a: 1 });
    const ct = blob.data.ct;
    const tampered = { ...blob, data: { ...blob.data, ct: (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1) } };
    await expect(openVault(key, tampered)).rejects.toMatchObject({ code: 'CORRUPTED' });
  });

  it('exports and re-imports the raw key', async () => {
    const { key, salt } = await makeKey();
    const blob = await sealVault(key, salt, ITER, 'x');
    const restored = await importRawKey(await exportRawKey(key));
    expect(await openVault(restored, blob)).toBe('x');
  });

  it('parseBlob rejects malformed input as CORRUPTED', () => {
    expect(() => parseBlob({ v: 1, salt: 1 })).toThrow(expect.objectContaining({ code: 'CORRUPTED' }));
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/shared/base64.test.ts tests/background/crypto.test.ts`
预期：FAIL，报错找不到模块

- [ ] **Step 3: 实现**

`src/shared/base64.ts`：
```ts
const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

`src/background/vault/errors.ts`：
```ts
import { LOCKOUT_MS, MIN_PASSWORD_LENGTH } from '@/shared/constants';

export type VaultErrorCode =
  | 'NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'WEAK_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'LOCKED_OUT'
  | 'LOCKED'
  | 'CORRUPTED'
  | 'INVALID_DATA';

const MESSAGES: Record<VaultErrorCode, string> = {
  NOT_INITIALIZED: '尚未设置主密码',
  ALREADY_INITIALIZED: '主密码已设置，不能重复初始化',
  WEAK_PASSWORD: `主密码至少需要 ${MIN_PASSWORD_LENGTH} 位`,
  WRONG_PASSWORD: '主密码错误',
  LOCKED_OUT: `尝试次数过多，请 ${LOCKOUT_MS / 1000} 秒后再试`,
  LOCKED: '数据已上锁，请先解锁',
  CORRUPTED: '数据已损坏，请从备份导入',
  INVALID_DATA: '数据格式不正确',
};

export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, detail?: string) {
    super(detail ? `${MESSAGES[code]}：${detail}` : MESSAGES[code]);
    this.name = 'VaultError';
  }
}
```

`src/background/vault/crypto.ts`：
```ts
import * as v from 'valibot';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import { IV_BYTES, VAULT_CHECK_TEXT } from '@/shared/constants';
import { VaultError } from './errors';

const SealedSchema = v.object({ iv: v.string(), ct: v.string() });

export const EncryptedBlobSchema = v.object({
  v: v.literal(1),
  salt: v.string(),
  iterations: v.pipe(v.number(), v.integer(), v.minValue(1)),
  check: SealedSchema,
  data: SealedSchema,
});

export type EncryptedBlob = v.InferOutput<typeof EncryptedBlobSchema>;
type Sealed = v.InferOutput<typeof SealedSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const AES = { name: 'AES-GCM', length: 256 } as const;

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(password: string, salt: BufferSource, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    AES,
    true,
    ['encrypt', 'decrypt'],
  );
}

async function seal(key: CryptoKey, plaintext: string): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  return { iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
}

async function unseal(key: CryptoKey, sealed: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(sealed.iv) },
    key,
    base64ToBytes(sealed.ct),
  );
  return decoder.decode(pt);
}

export async function sealVault(
  key: CryptoKey,
  saltB64: string,
  iterations: number,
  data: unknown,
): Promise<EncryptedBlob> {
  return {
    v: 1,
    salt: saltB64,
    iterations,
    check: await seal(key, VAULT_CHECK_TEXT),
    data: await seal(key, JSON.stringify(data)),
  };
}

export async function openVault(key: CryptoKey, blob: EncryptedBlob): Promise<unknown> {
  const check = await unseal(key, blob.check).catch(() => null);
  if (check !== VAULT_CHECK_TEXT) throw new VaultError('WRONG_PASSWORD');
  try {
    return JSON.parse(await unseal(key, blob.data));
  } catch {
    throw new VaultError('CORRUPTED');
  }
}

export function parseBlob(raw: unknown): EncryptedBlob {
  const result = v.safeParse(EncryptedBlobSchema, raw);
  if (!result.success) throw new VaultError('CORRUPTED');
  return result.output;
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importRawKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(b64), AES, false, ['encrypt', 'decrypt']);
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/shared/base64.test.ts tests/background/crypto.test.ts`
预期：PASS（8 个测试）

- [ ] **Step 5: Commit**

```bash
git add src/shared/base64.ts src/background/vault tests
git commit -m "feat: add AES-GCM vault crypto with password check block"
```

---

### Task 4: Vault 存储（setup / unlock / lock / read / write）

**Files:**
- Create: `src/background/storage.ts`, `src/background/vault/vault.ts`, `tests/helpers/memory-area.ts`
- Test: `tests/background/vault.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `VaultDataSchema`、`VaultData`、常量；Task 3 的全部 crypto 函数和 `VaultError`
- Produces:
  - `interface KVArea { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> }`
  - `fromBrowserArea(area: StorageAreaLike): KVArea`
  - `type VaultStatus = 'uninitialized' | 'locked' | 'unlocked'`（定义在 `vault.ts`；Task 6 的 `messages.ts` 会为 UI 再定义一个相同的类型，避免 UI 依赖 background 代码）
  - `createVault(deps: { local: KVArea; session: KVArea; now: () => number; iterations?: number })`，返回 `{ status(): Promise<VaultStatus>; setup(password, data: VaultData): Promise<void>; unlock(password): Promise<void>; lock(): Promise<void>; read(): Promise<VaultData>; write(data: VaultData): Promise<void> }`
  - `type Vault = ReturnType<typeof createVault>`
  - 测试辅助函数 `memoryArea(): KVArea`

- [ ] **Step 1: 写存储抽象和测试辅助函数**

`src/background/storage.ts`：
```ts
export interface KVArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

interface StorageAreaLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
}

export function fromBrowserArea(area: StorageAreaLike): KVArea {
  return {
    get: async (key) => (await area.get(key))[key],
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
  };
}
```

`tests/helpers/memory-area.ts`：
```ts
import type { KVArea } from '@/background/storage';

/** 模拟 chrome.storage：读写都做结构化克隆，与真实存储的序列化语义一致。 */
export function memoryArea(): KVArea {
  let store: Readonly<Record<string, unknown>> = {};
  return {
    get: async (key) => structuredClone(store[key]),
    set: async (key, value) => {
      store = { ...store, [key]: structuredClone(value) };
    },
    remove: async (key) => {
      const { [key]: _removed, ...rest } = store;
      store = rest;
    },
  };
}
```

- [ ] **Step 2: 写失败测试**

`tests/background/vault.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { createVault } from '@/background/vault/vault';
import { LOCKOUT_MS, MAX_FAILED_ATTEMPTS, STORAGE_KEYS } from '@/shared/constants';
import { emptyEducation } from '@/shared/schema/profile';
import { emptyVaultData, type VaultData } from '@/shared/schema/vault-data';
import { memoryArea } from '../helpers/memory-area';

const PW = 'correct-horse-1';

function setupVault() {
  let clock = 0;
  const local = memoryArea();
  const session = memoryArea();
  const vault = createVault({ local, session, now: () => clock, iterations: 1000 });
  return { vault, local, session, advance: (ms: number) => { clock += ms; } };
}

function withName(name: string): VaultData {
  const data = emptyVaultData();
  return { ...data, profile: { ...data.profile, basic: { ...data.profile.basic, name } } };
}

describe('vault', () => {
  it('starts uninitialized and becomes unlocked after setup', async () => {
    const { vault } = setupVault();
    expect(await vault.status()).toBe('uninitialized');
    await vault.setup(PW, emptyVaultData());
    expect(await vault.status()).toBe('unlocked');
    expect(await vault.read()).toEqual(emptyVaultData());
  });

  it('rejects weak passwords and double setup', async () => {
    const { vault } = setupVault();
    await expect(vault.setup('short', emptyVaultData())).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
    await vault.setup(PW, emptyVaultData());
    await expect(vault.setup(PW, emptyVaultData())).rejects.toMatchObject({ code: 'ALREADY_INITIALIZED' });
  });

  it('unlock before setup reports NOT_INITIALIZED', async () => {
    const { vault } = setupVault();
    await expect(vault.unlock(PW)).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
  });

  it('lock clears the key; unlock restores access', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, withName('张三'));
    await vault.lock();
    expect(await vault.status()).toBe('locked');
    await expect(vault.read()).rejects.toMatchObject({ code: 'LOCKED' });
    await vault.unlock(PW);
    expect((await vault.read()).profile.basic.name).toBe('张三');
  });

  it('rejects a wrong password', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.lock();
    await expect(vault.unlock('wrong-password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(await vault.status()).toBe('locked');
  });

  it('locks out after repeated failures, then recovers', async () => {
    const { vault, advance } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.lock();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await expect(vault.unlock('wrong-password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    }
    await expect(vault.unlock(PW)).rejects.toMatchObject({ code: 'LOCKED_OUT' });
    advance(LOCKOUT_MS);
    await vault.unlock(PW);
    expect(await vault.status()).toBe('unlocked');
  });

  it('stores only ciphertext', async () => {
    const { vault, local } = setupVault();
    await vault.setup(PW, emptyVaultData());
    await vault.write(withName('李四测试'));
    const stored = JSON.stringify(await local.get(STORAGE_KEYS.vault));
    expect(stored).not.toContain('李四测试');
    expect((await vault.read()).profile.basic.name).toBe('李四测试');
  });

  it('write rejects invalid data', async () => {
    const { vault } = setupVault();
    await vault.setup(PW, emptyVaultData());
    const data = emptyVaultData();
    const bad = { ...data, profile: { ...data.profile, education: [{ ...emptyEducation(), start: '2025/09' }] } };
    await expect(vault.write(bad)).rejects.toMatchObject({ code: 'INVALID_DATA' });
  });

  it('reports CORRUPTED for garbage in storage', async () => {
    const { vault, local } = setupVault();
    await local.set(STORAGE_KEYS.vault, { nope: true });
    await expect(vault.status()).rejects.toMatchObject({ code: 'CORRUPTED' });
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/background/vault.test.ts`
预期：FAIL，报错 `Cannot find module '@/background/vault/vault'`

- [ ] **Step 4: 实现 vault**

`src/background/vault/vault.ts`：
```ts
import * as v from 'valibot';
import { base64ToBytes, bytesToBase64 } from '@/shared/base64';
import {
  LOCKOUT_MS, MAX_FAILED_ATTEMPTS, MIN_PASSWORD_LENGTH, PBKDF2_ITERATIONS, SALT_BYTES, STORAGE_KEYS,
} from '@/shared/constants';
import { type VaultData, VaultDataSchema } from '@/shared/schema/vault-data';
import type { KVArea } from '../storage';
import {
  deriveKey, type EncryptedBlob, exportRawKey, importRawKey, openVault, parseBlob, randomBytes, sealVault,
} from './crypto';
import { VaultError } from './errors';

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface VaultDeps {
  local: KVArea;
  session: KVArea;
  now: () => number;
  iterations?: number;
}

const LockoutSchema = v.object({ failures: v.number(), until: v.number() });
type Lockout = v.InferOutput<typeof LockoutSchema>;
const NO_LOCKOUT: Lockout = { failures: 0, until: 0 };

function validate(data: unknown): VaultData {
  const result = v.safeParse(VaultDataSchema, data);
  if (!result.success) throw new VaultError('INVALID_DATA', result.issues[0].message);
  return result.output;
}

export function createVault(deps: VaultDeps) {
  const iterations = deps.iterations ?? PBKDF2_ITERATIONS;

  async function readBlob(): Promise<EncryptedBlob | undefined> {
    const raw = await deps.local.get(STORAGE_KEYS.vault);
    return raw === undefined ? undefined : parseBlob(raw);
  }

  async function requireBlob(): Promise<EncryptedBlob> {
    const blob = await readBlob();
    if (!blob) throw new VaultError('NOT_INITIALIZED');
    return blob;
  }

  async function currentKey(): Promise<CryptoKey | undefined> {
    const raw = await deps.session.get(STORAGE_KEYS.sessionKey);
    return typeof raw === 'string' ? importRawKey(raw) : undefined;
  }

  async function requireKey(): Promise<CryptoKey> {
    const key = await currentKey();
    if (!key) throw new VaultError('LOCKED');
    return key;
  }

  async function rememberKey(key: CryptoKey): Promise<void> {
    await deps.session.set(STORAGE_KEYS.sessionKey, await exportRawKey(key));
  }

  async function getLockout(): Promise<Lockout> {
    const result = v.safeParse(LockoutSchema, await deps.session.get(STORAGE_KEYS.lockout));
    return result.success ? result.output : NO_LOCKOUT;
  }

  async function registerFailure(): Promise<void> {
    const current = await getLockout();
    const failures = current.failures + 1;
    const next: Lockout = failures >= MAX_FAILED_ATTEMPTS
      ? { failures: 0, until: deps.now() + LOCKOUT_MS }
      : { failures, until: current.until };
    await deps.session.set(STORAGE_KEYS.lockout, next);
  }

  async function status(): Promise<VaultStatus> {
    if (!(await readBlob())) return 'uninitialized';
    return (await currentKey()) ? 'unlocked' : 'locked';
  }

  async function setup(password: string, data: VaultData): Promise<void> {
    if (await readBlob()) throw new VaultError('ALREADY_INITIALIZED');
    if (password.length < MIN_PASSWORD_LENGTH) throw new VaultError('WEAK_PASSWORD');
    const valid = validate(data);
    const salt = bytesToBase64(randomBytes(SALT_BYTES));
    const key = await deriveKey(password, base64ToBytes(salt), iterations);
    await deps.local.set(STORAGE_KEYS.vault, await sealVault(key, salt, iterations, valid));
    await rememberKey(key);
  }

  async function unlock(password: string): Promise<void> {
    const blob = await requireBlob();
    if (deps.now() < (await getLockout()).until) throw new VaultError('LOCKED_OUT');
    const key = await deriveKey(password, base64ToBytes(blob.salt), blob.iterations);
    try {
      await openVault(key, blob);
    } catch (error) {
      if (error instanceof VaultError && error.code === 'WRONG_PASSWORD') await registerFailure();
      throw error;
    }
    await deps.session.set(STORAGE_KEYS.lockout, NO_LOCKOUT);
    await rememberKey(key);
  }

  async function lock(): Promise<void> {
    await deps.session.remove(STORAGE_KEYS.sessionKey);
  }

  async function read(): Promise<VaultData> {
    const blob = await requireBlob();
    const raw = await openVault(await requireKey(), blob);
    const result = v.safeParse(VaultDataSchema, raw);
    if (!result.success) throw new VaultError('CORRUPTED');
    return result.output;
  }

  async function write(data: VaultData): Promise<void> {
    const blob = await requireBlob();
    const key = await requireKey();
    const valid = validate(data);
    await deps.local.set(STORAGE_KEYS.vault, await sealVault(key, blob.salt, blob.iterations, valid));
  }

  return { status, setup, unlock, lock, read, write };
}

export type Vault = ReturnType<typeof createVault>;
```

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/background/vault.test.ts`
预期：PASS（9 个测试）

- [ ] **Step 6: Commit**

```bash
git add src/background tests
git commit -m "feat: add encrypted vault with lockout and session key"
```

---

### Task 5: 自动上锁和偏好存储

**Files:**
- Create: `src/background/auto-lock.ts`, `src/background/prefs.ts`
- Test: `tests/background/auto-lock.test.ts`, `tests/background/prefs.test.ts`

**Interfaces:**
- Consumes: `KVArea`（Task 4）、`PrefsSchema`/`Prefs`/`DEFAULT_PREFS`（Task 2）、`AUTO_LOCK_ALARM`
- Produces:
  - `interface AlarmsLike { create(name: string, info: { delayInMinutes: number }): Promise<void>; clear(name: string): Promise<boolean> }`
  - `interface AutoLock { touch(): Promise<void>; cancel(): Promise<void> }`
  - `createAutoLock(alarms: AlarmsLike, getMinutes: () => Promise<number>): AutoLock`
  - `isAutoLockAlarm(alarm: { name: string }): boolean`
  - `interface PrefsStore { get(): Promise<Prefs>; save(prefs: Prefs): Promise<void> }`、`createPrefs(local: KVArea): PrefsStore`

- [ ] **Step 1: 写失败测试**

`tests/background/auto-lock.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { createAutoLock, isAutoLockAlarm } from '@/background/auto-lock';
import { AUTO_LOCK_ALARM } from '@/shared/constants';

function fakeAlarms() {
  const calls: string[] = [];
  return {
    calls,
    create: async (name: string, info: { delayInMinutes: number }) => {
      calls.push(`create:${name}:${info.delayInMinutes}`);
    },
    clear: async (name: string) => {
      calls.push(`clear:${name}`);
      return true;
    },
  };
}

describe('auto lock', () => {
  it('schedules an alarm for the configured minutes', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 15).touch();
    expect(alarms.calls).toEqual([`create:${AUTO_LOCK_ALARM}:15`]);
  });

  it('clears the alarm when minutes is 0 (lock on browser close only)', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 0).touch();
    expect(alarms.calls).toEqual([`clear:${AUTO_LOCK_ALARM}`]);
  });

  it('cancel clears the alarm', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 60).cancel();
    expect(alarms.calls).toEqual([`clear:${AUTO_LOCK_ALARM}`]);
  });

  it('recognises its own alarm', () => {
    expect(isAutoLockAlarm({ name: AUTO_LOCK_ALARM })).toBe(true);
    expect(isAutoLockAlarm({ name: 'other' })).toBe(false);
  });
});
```

`tests/background/prefs.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { createPrefs } from '@/background/prefs';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_PREFS } from '@/shared/schema/prefs';
import { memoryArea } from '../helpers/memory-area';

describe('prefs', () => {
  it('returns defaults when nothing is stored', async () => {
    expect(await createPrefs(memoryArea()).get()).toEqual(DEFAULT_PREFS);
  });

  it('returns defaults when stored value is invalid', async () => {
    const local = memoryArea();
    await local.set(STORAGE_KEYS.prefs, { autoLockMinutes: 'x' });
    expect(await createPrefs(local).get()).toEqual(DEFAULT_PREFS);
  });

  it('saves and reads back', async () => {
    const prefs = createPrefs(memoryArea());
    await prefs.save({ autoLockMinutes: 15 });
    expect(await prefs.get()).toEqual({ autoLockMinutes: 15 });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/background/auto-lock.test.ts tests/background/prefs.test.ts`
预期：FAIL，报错找不到模块

- [ ] **Step 3: 实现**

`src/background/auto-lock.ts`：
```ts
import { AUTO_LOCK_ALARM } from '@/shared/constants';

export interface AlarmsLike {
  create(name: string, info: { delayInMinutes: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
}

export interface AutoLock {
  /** 用户每次有效操作后调用，重新开始闲置计时。 */
  touch(): Promise<void>;
  cancel(): Promise<void>;
}

export function createAutoLock(alarms: AlarmsLike, getMinutes: () => Promise<number>): AutoLock {
  return {
    async touch() {
      const minutes = await getMinutes();
      if (minutes <= 0) {
        await alarms.clear(AUTO_LOCK_ALARM);
        return;
      }
      await alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });
    },
    async cancel() {
      await alarms.clear(AUTO_LOCK_ALARM);
    },
  };
}

export function isAutoLockAlarm(alarm: { name: string }): boolean {
  return alarm.name === AUTO_LOCK_ALARM;
}
```

`src/background/prefs.ts`：
```ts
import * as v from 'valibot';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_PREFS, type Prefs, PrefsSchema } from '@/shared/schema/prefs';
import type { KVArea } from './storage';

export interface PrefsStore {
  get(): Promise<Prefs>;
  save(prefs: Prefs): Promise<void>;
}

export function createPrefs(local: KVArea): PrefsStore {
  return {
    async get() {
      const result = v.safeParse(PrefsSchema, await local.get(STORAGE_KEYS.prefs));
      return result.success ? result.output : DEFAULT_PREFS;
    },
    async save(prefs) {
      await local.set(STORAGE_KEYS.prefs, v.parse(PrefsSchema, prefs));
    },
  };
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/background/auto-lock.test.ts tests/background/prefs.test.ts`
预期：PASS（7 个测试）

- [ ] **Step 5: Commit**

```bash
git add src/background tests/background
git commit -m "feat: add auto-lock alarm and prefs store"
```

---

### Task 6: 消息协议、router 和 background 接线

**Files:**
- Create: `src/shared/messages.ts`, `src/background/handlers.ts`, `src/background/router.ts`
- Modify: `src/entrypoints/background.ts`（整个文件替换）
- Test: `tests/background/router.test.ts`

**Interfaces:**
- Consumes: `Vault`/`createVault`/`VaultStatus`（Task 4）、`AutoLock`/`createAutoLock`/`isAutoLockAlarm`/`PrefsStore`/`createPrefs`（Task 5）、`VaultError`（Task 3）、`ProfileSchema`/`Profile`/`PrefsSchema`/`Prefs`/`emptyVaultData`（Task 2）
- Produces:
  - `RequestSchema`、`type Request`（按 `type` 区分的联合类型，共 8 种：`vault.status`、`vault.setup{password}`、`vault.unlock{password}`、`vault.lock`、`profile.get`、`profile.save{profile}`、`prefs.get`、`prefs.save{prefs}`）
  - `type Response<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }`
  - `interface ResponseMap`（每种请求类型对应的返回数据类型）
  - `type VaultStatus`（从 vault 重新导出，供 UI 使用）
  - `classifySender(sender: SenderLike, extId: string, extOrigin: string): 'extension' | 'content' | 'unknown'`
  - `createRouter(deps: RouterDeps): (raw: unknown, sender: SenderLike) => Promise<Response<unknown>>`

- [ ] **Step 1: 写消息协议**

`src/shared/messages.ts`：
```ts
import * as v from 'valibot';
import { type Profile, ProfileSchema } from './schema/profile';
import { type Prefs, PrefsSchema } from './schema/prefs';

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export const RequestSchema = v.variant('type', [
  v.object({ type: v.literal('vault.status') }),
  v.object({ type: v.literal('vault.setup'), password: v.string() }),
  v.object({ type: v.literal('vault.unlock'), password: v.string() }),
  v.object({ type: v.literal('vault.lock') }),
  v.object({ type: v.literal('profile.get') }),
  v.object({ type: v.literal('profile.save'), profile: ProfileSchema }),
  v.object({ type: v.literal('prefs.get') }),
  v.object({ type: v.literal('prefs.save'), prefs: PrefsSchema }),
]);

export type Request = v.InferOutput<typeof RequestSchema>;
export type RequestType = Request['type'];

export interface ResponseMap {
  'vault.status': { status: VaultStatus };
  'vault.setup': null;
  'vault.unlock': null;
  'vault.lock': null;
  'profile.get': Profile;
  'profile.save': null;
  'prefs.get': Prefs;
  'prefs.save': null;
}

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

- [ ] **Step 2: 写失败测试**

`tests/background/router.test.ts`：
```ts
import { describe, expect, it, vi } from 'vitest';
import { createPrefs } from '@/background/prefs';
import { classifySender, createRouter } from '@/background/router';
import { createVault, type Vault } from '@/background/vault/vault';
import { emptyProfile } from '@/shared/schema/profile';
import { memoryArea } from '../helpers/memory-area';

const EXT_ID = 'ext-id';
const ORIGIN = 'chrome-extension://ext-id/';
const page = { id: EXT_ID, url: `${ORIGIN}popup.html` };
const optionsTab = { id: EXT_ID, url: `${ORIGIN}options.html`, tab: { id: 3 } };
const content = { id: EXT_ID, url: 'https://jobs.example.com/apply', tab: { id: 1 } };
const PW = 'correct-horse-1';

function makeRouter(vaultOverride?: Vault) {
  const local = memoryArea();
  const session = memoryArea();
  const vault = vaultOverride ?? createVault({ local, session, now: () => 0, iterations: 1000 });
  const events: string[] = [];
  const autoLock = {
    touch: async () => { events.push('touch'); },
    cancel: async () => { events.push('cancel'); },
  };
  const handle = createRouter({ vault, prefs: createPrefs(local), autoLock, extId: EXT_ID, extOrigin: ORIGIN });
  return { handle, events };
}

describe('classifySender', () => {
  it('classifies extension pages, content scripts and strangers', () => {
    expect(classifySender(page, EXT_ID, ORIGIN)).toBe('extension');
    expect(classifySender(optionsTab, EXT_ID, ORIGIN)).toBe('extension');
    expect(classifySender(content, EXT_ID, ORIGIN)).toBe('content');
    expect(classifySender({ id: 'other', url: ORIGIN }, EXT_ID, ORIGIN)).toBe('unknown');
    expect(classifySender({ id: EXT_ID }, EXT_ID, ORIGIN)).toBe('unknown');
  });
});

describe('router', () => {
  it('rejects malformed requests', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'nope' }, page)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it('forbids content scripts and unknown senders from extension-only APIs', async () => {
    const { handle } = makeRouter();
    expect(await handle({ type: 'profile.get' }, content)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(await handle({ type: 'vault.status' }, { id: 'evil' })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('runs the full setup → save → lock → unlock flow', async () => {
    const { handle, events } = makeRouter();
    expect(await handle({ type: 'vault.status' }, page)).toEqual({ ok: true, data: { status: 'uninitialized' } });
    expect(await handle({ type: 'vault.setup', password: PW }, page)).toEqual({ ok: true, data: null });

    const base = emptyProfile();
    const profile = { ...base, basic: { ...base.basic, name: '测试用户' } };
    expect(await handle({ type: 'profile.save', profile }, page)).toEqual({ ok: true, data: null });

    expect(await handle({ type: 'vault.lock' }, page)).toEqual({ ok: true, data: null });
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: false, error: { code: 'LOCKED' } });

    await handle({ type: 'vault.unlock', password: PW }, page);
    expect(await handle({ type: 'profile.get' }, page)).toMatchObject({ ok: true, data: { basic: { name: '测试用户' } } });
    expect(events).toContain('touch');
    expect(events).toContain('cancel');
  });

  it('saves and reads prefs', async () => {
    const { handle } = makeRouter();
    await handle({ type: 'prefs.save', prefs: { autoLockMinutes: 15 } }, page);
    expect(await handle({ type: 'prefs.get' }, page)).toEqual({ ok: true, data: { autoLockMinutes: 15 } });
  });

  it('hides unexpected errors behind INTERNAL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { status: async () => { throw new Error('boom'); } } as unknown as Vault;
    const { handle } = makeRouter(broken);
    expect(await handle({ type: 'vault.status' }, page)).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: '内部错误，请重试' },
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/background/router.test.ts`
预期：FAIL，报错 `Cannot find module '@/background/router'`

- [ ] **Step 4: 实现 handlers 和 router**

`src/background/handlers.ts`：
```ts
import type { Request } from '@/shared/messages';
import { emptyVaultData } from '@/shared/schema/vault-data';
import type { AutoLock } from './auto-lock';
import type { PrefsStore } from './prefs';
import type { Vault } from './vault/vault';

export interface HandlerDeps {
  vault: Vault;
  prefs: PrefsStore;
  autoLock: AutoLock;
}

export async function dispatch(req: Request, d: HandlerDeps): Promise<unknown> {
  switch (req.type) {
    case 'vault.status':
      return { status: await d.vault.status() };
    case 'vault.setup':
      await d.vault.setup(req.password, emptyVaultData());
      await d.autoLock.touch();
      return null;
    case 'vault.unlock':
      await d.vault.unlock(req.password);
      await d.autoLock.touch();
      return null;
    case 'vault.lock':
      await d.vault.lock();
      await d.autoLock.cancel();
      return null;
    case 'profile.get': {
      const data = await d.vault.read();
      await d.autoLock.touch();
      return data.profile;
    }
    case 'profile.save': {
      const data = await d.vault.read();
      await d.vault.write({ ...data, profile: req.profile });
      await d.autoLock.touch();
      return null;
    }
    case 'prefs.get':
      return d.prefs.get();
    case 'prefs.save':
      await d.prefs.save(req.prefs);
      await d.autoLock.touch();
      return null;
  }
}
```

`src/background/router.ts`：
```ts
import * as v from 'valibot';
import { RequestSchema, type RequestType, type Response } from '@/shared/messages';
import { dispatch, type HandlerDeps } from './handlers';
import { VaultError } from './vault/errors';

export interface SenderLike {
  id?: string;
  url?: string;
  tab?: unknown;
}

export type SenderKind = 'extension' | 'content' | 'unknown';

export interface RouterDeps extends HandlerDeps {
  extId: string;
  extOrigin: string;
}

/** content script 可调用的接口白名单。M1 为空；M3 加入 scan / fill / suggest。 */
const CONTENT_ALLOWED: ReadonlySet<RequestType> = new Set<RequestType>();

export function classifySender(sender: SenderLike, extId: string, extOrigin: string): SenderKind {
  if (sender.id !== extId) return 'unknown';
  if (sender.url?.startsWith(extOrigin)) return 'extension';
  if (sender.tab) return 'content';
  return 'unknown';
}

const fail = (code: string, message: string): Response<never> => ({ ok: false, error: { code, message } });

function toFailure(error: unknown): Response<never> {
  if (error instanceof VaultError) return fail(error.code, error.message);
  console.error('[ResumeSub] unexpected error', error);
  return fail('INTERNAL', '内部错误，请重试');
}

export function createRouter(deps: RouterDeps) {
  return async function handle(raw: unknown, sender: SenderLike): Promise<Response<unknown>> {
    const parsed = v.safeParse(RequestSchema, raw);
    if (!parsed.success) return fail('BAD_REQUEST', '请求格式无效');
    const req = parsed.output;
    const kind = classifySender(sender, deps.extId, deps.extOrigin);
    const allowed = kind === 'extension' || (kind === 'content' && CONTENT_ALLOWED.has(req.type));
    if (!allowed) return fail('FORBIDDEN', '无权调用该接口');
    try {
      return { ok: true, data: await dispatch(req, deps) };
    } catch (error) {
      return toFailure(error);
    }
  };
}
```

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/background/router.test.ts`
预期：PASS（6 个测试）

- [ ] **Step 6: background 接线**

`src/entrypoints/background.ts`（整个文件替换）：
```ts
import { browser } from 'wxt/browser';
import { createAutoLock, isAutoLockAlarm } from '@/background/auto-lock';
import { createPrefs } from '@/background/prefs';
import { createRouter } from '@/background/router';
import { fromBrowserArea } from '@/background/storage';
import { createVault } from '@/background/vault/vault';

export default defineBackground(() => {
  // 显式声明：session 区只允许扩展自身页面访问，content script 不可读
  void browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });

  const local = fromBrowserArea(browser.storage.local);
  const session = fromBrowserArea(browser.storage.session);
  const vault = createVault({ local, session, now: Date.now });
  const prefs = createPrefs(local);
  const autoLock = createAutoLock(
    {
      create: (name, info) => browser.alarms.create(name, info),
      clear: (name) => browser.alarms.clear(name),
    },
    async () => (await prefs.get()).autoLockMinutes,
  );
  const extOrigin = `${new URL(browser.runtime.getURL('/popup.html')).origin}/`;
  const handle = createRouter({ vault, prefs, autoLock, extId: browser.runtime.id, extOrigin });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handle(message, sender).then(sendResponse);
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (isAutoLockAlarm(alarm)) void vault.lock();
  });
});
```

- [ ] **Step 7: 全量测试、类型检查和构建**

```bash
npm test && npm run compile && npm run build
```
预期：全部通过。如果 tsc 报错说 `browser.storage.local` 和 `StorageAreaLike` 类型不兼容，改为在 `background.ts` 中显式包一层，与 alarms 的写法相同：`fromBrowserArea({ get: (k) => browser.storage.local.get(k), set: (i) => browser.storage.local.set(i), remove: (k) => browser.storage.local.remove(k) })`，session 区同样处理。

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat: add validated message router with sender allowlist"
```

---

### Task 7: UI 客户端和 popup（设置密码、解锁、上锁）

**Files:**
- Create: `src/shared/client.ts`, `src/entrypoints/popup/App.tsx`, `src/entrypoints/popup/SetupForm.tsx`, `src/entrypoints/popup/UnlockForm.tsx`
- Modify: `src/entrypoints/popup/main.tsx`（整个文件替换）
- Test: `tests/popup/popup.test.tsx`

**Interfaces:**
- Consumes: `Request`、`RequestType`、`ResponseMap`、`Response`、`VaultStatus`（Task 6）、`MIN_PASSWORD_LENGTH`
- Produces:
  - `class ApiError extends Error { readonly code: string }`
  - `call<K extends RequestType>(req: Extract<Request, { type: K }>): Promise<ResponseMap[K]>`
  - `errorText(e: unknown): string`
  - `validateNewPassword(password: string, confirm: string): string | null`

- [ ] **Step 1: 写 client**

`src/shared/client.ts`：
```ts
import { browser } from 'wxt/browser';
import type { Request, RequestType, Response, ResponseMap } from './messages';

export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function call<K extends RequestType>(req: Extract<Request, { type: K }>): Promise<ResponseMap[K]> {
  const res = (await browser.runtime.sendMessage(req)) as Response<ResponseMap[K]> | undefined;
  if (!res) throw new ApiError('NO_RESPONSE', '后台无响应，请重试');
  if (!res.ok) throw new ApiError(res.error.code, res.error.message);
  return res.data;
}

export function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : '发生未知错误，请重试';
}
```

- [ ] **Step 2: 写失败测试**

`tests/popup/popup.test.tsx`：
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/popup/App';
import { validateNewPassword } from '@/entrypoints/popup/SetupForm';
import { ApiError, call } from '@/shared/client';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));

const mockCall = vi.mocked(call);
const PW = 'correct-horse-1';

function backend(initial: 'uninitialized' | 'locked' | 'unlocked') {
  let status = initial;
  mockCall.mockImplementation((async (req: { type: string; password?: string }) => {
    if (req.type === 'vault.status') return { status };
    if (req.type === 'vault.setup' || req.type === 'vault.unlock') {
      if (req.password !== PW) throw new ApiError('WRONG_PASSWORD', '主密码错误');
      status = 'unlocked';
      return null;
    }
    if (req.type === 'vault.lock') { status = 'locked'; return null; }
    throw new Error(`unexpected ${req.type}`);
  }) as never);
}

function typeInto(label: string, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => mockCall.mockReset());
afterEach(cleanup);

describe('validateNewPassword', () => {
  it('checks length and confirmation', () => {
    expect(validateNewPassword('short', 'short')).toContain('至少');
    expect(validateNewPassword(PW, 'different-pw')).toBe('两次输入的密码不一致');
    expect(validateNewPassword(PW, PW)).toBeNull();
  });
});

describe('popup', () => {
  it('creates a vault on first run', async () => {
    backend('uninitialized');
    render(<App />);
    await screen.findByText('创建加密档案');
    typeInto('主密码', PW);
    typeInto('确认主密码', PW);
    fireEvent.click(screen.getByText('创建加密档案'));
    await screen.findByText('✅ 已解锁');
    expect(mockCall).toHaveBeenCalledWith({ type: 'vault.setup', password: PW });
  });

  it('does not call setup when confirmation mismatches', async () => {
    backend('uninitialized');
    render(<App />);
    await screen.findByText('创建加密档案');
    typeInto('主密码', PW);
    typeInto('确认主密码', 'something-else');
    fireEvent.click(screen.getByText('创建加密档案'));
    await screen.findByText('两次输入的密码不一致');
    expect(mockCall).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'vault.setup' }));
  });

  it('shows backend error on wrong password and unlocks on correct one', async () => {
    backend('locked');
    render(<App />);
    await screen.findByText('解锁');
    typeInto('主密码', 'nope-nope-nope');
    fireEvent.click(screen.getByText('解锁'));
    await screen.findByText('主密码错误');
    typeInto('主密码', PW);
    fireEvent.click(screen.getByText('解锁'));
    await screen.findByText('✅ 已解锁');
  });

  it('locks on demand', async () => {
    backend('unlocked');
    render(<App />);
    fireEvent.click(await screen.findByText('立即上锁'));
    await waitFor(() => expect(screen.getByText('解锁')).toBeTruthy());
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

运行：`npx vitest run tests/popup/popup.test.tsx`
预期：FAIL，报错 `Cannot find module '@/entrypoints/popup/App'`

- [ ] **Step 4: 实现 popup 组件**

`src/entrypoints/popup/SetupForm.tsx`：
```tsx
import { useState } from 'preact/hooks';
import { MIN_PASSWORD_LENGTH } from '@/shared/constants';

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `主密码至少需要 ${MIN_PASSWORD_LENGTH} 位`;
  if (password !== confirm) return '两次输入的密码不一致';
  return null;
}

export function SetupForm({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: Event) => {
    event.preventDefault();
    const issue = validateNewPassword(password, confirm);
    setProblem(issue);
    if (!issue) onSubmit(password);
  };

  return (
    <form onSubmit={submit}>
      <p>首次使用，请设置主密码（至少 {MIN_PASSWORD_LENGTH} 位）。</p>
      <p class="warn">⚠️ 主密码不会被保存，忘记后数据无法恢复。</p>
      <label>
        主密码
        <input type="password" autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
      </label>
      <label>
        确认主密码
        <input type="password" value={confirm} onInput={(e) => setConfirm(e.currentTarget.value)} />
      </label>
      {problem && <p class="error">{problem}</p>}
      <button type="submit">创建加密档案</button>
    </form>
  );
}
```

`src/entrypoints/popup/UnlockForm.tsx`：
```tsx
import { useState } from 'preact/hooks';

export function UnlockForm({ onSubmit }: { onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');

  const submit = (event: Event) => {
    event.preventDefault();
    onSubmit(password);
    setPassword('');
  };

  return (
    <form onSubmit={submit}>
      <label>
        主密码
        <input type="password" autoFocus value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
      </label>
      <button type="submit">解锁</button>
    </form>
  );
}
```

`src/entrypoints/popup/App.tsx`：
```tsx
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { call, errorText } from '@/shared/client';
import type { VaultStatus } from '@/shared/messages';
import { SetupForm } from './SetupForm';
import { UnlockForm } from './UnlockForm';

export function App() {
  const [status, setStatus] = useState<VaultStatus | 'loading'>('loading');
  const [error, setError] = useState('');

  const refresh = async () => setStatus((await call({ type: 'vault.status' })).status);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    void run(async () => {});
  }, []);

  return (
    <main class="popup">
      <h1>ResumeSub</h1>
      {status === 'loading' && <p>加载中…</p>}
      {status === 'uninitialized' && (
        <SetupForm onSubmit={(password) => void run(() => call({ type: 'vault.setup', password }))} />
      )}
      {status === 'locked' && (
        <UnlockForm onSubmit={(password) => void run(() => call({ type: 'vault.unlock', password }))} />
      )}
      {status === 'unlocked' && (
        <div class="row">
          <p>✅ 已解锁</p>
          <button type="button" onClick={() => void browser.runtime.openOptionsPage()}>编辑档案</button>
          <button type="button" onClick={() => void run(() => call({ type: 'vault.lock' }))}>立即上锁</button>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </main>
  );
}
```

`src/entrypoints/popup/main.tsx`（整个文件替换）：
```tsx
import { render } from 'preact';
import '@/ui/base.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 5: 运行测试，确认通过**

运行：`npx vitest run tests/popup/popup.test.tsx`
预期：PASS（5 个测试）

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat: add popup setup, unlock and lock flows"
```

---

### Task 8: Options 表单组件

**Files:**
- Create: `src/shared/immutable.ts`, `src/entrypoints/options/fields.ts`, `src/entrypoints/options/LinesInput.tsx`, `src/entrypoints/options/FieldInput.tsx`, `src/entrypoints/options/ObjectForm.tsx`, `src/entrypoints/options/ListSection.tsx`, `src/entrypoints/options/CustomFields.tsx`
- Test: `tests/shared/immutable.test.ts`, `tests/options/components.test.tsx`

**Interfaces:**
- Consumes: Task 2 中 Profile 的子类型
- Produces:
  - `updateAt<T>(items: readonly T[], index: number, item: T): T[]`、`removeAt<T>(items: readonly T[], index: number): T[]`
  - `type FieldKind = 'text' | 'date' | 'month' | 'lines' | 'select'`、`interface FieldDef { key; label; kind?; options?; allowPresent? }`
  - 字段定义常量：`BASIC_FIELDS`、`EDUCATION_FIELDS`、`EXPERIENCE_FIELDS`、`PROJECT_FIELDS`、`AWARD_FIELDS`、`SKILLS_FIELDS`、`PREFERENCES_FIELDS`
  - `splitLines(text: string): string[]`
  - 组件：`<ObjectForm fields value onChange />`、`<ListSection title fields items create onChange itemLabel />`、`<CustomFields value onChange />`

- [ ] **Step 1: 写失败测试**

`tests/shared/immutable.test.ts`：
```ts
import { expect, it } from 'vitest';
import { removeAt, updateAt } from '@/shared/immutable';

it('updateAt returns a new array and leaves the original untouched', () => {
  const original = ['a', 'b', 'c'] as const;
  expect(updateAt(original, 1, 'x')).toEqual(['a', 'x', 'c']);
  expect(original).toEqual(['a', 'b', 'c']);
});

it('removeAt returns a new array without the index', () => {
  const original = [1, 2, 3];
  expect(removeAt(original, 0)).toEqual([2, 3]);
  expect(original).toEqual([1, 2, 3]);
});
```

`tests/options/components.test.tsx`：
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFields } from '@/entrypoints/options/CustomFields';
import { BASIC_FIELDS, EDUCATION_FIELDS, EXPERIENCE_FIELDS } from '@/entrypoints/options/fields';
import { splitLines } from '@/entrypoints/options/LinesInput';
import { ListSection } from '@/entrypoints/options/ListSection';
import { ObjectForm } from '@/entrypoints/options/ObjectForm';
import { emptyEducation, emptyExperience, emptyProfile } from '@/shared/schema/profile';

afterEach(cleanup);

describe('splitLines', () => {
  it('trims and drops blank lines', () => {
    expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });
});

describe('ObjectForm', () => {
  it('emits a new object without mutating the input', () => {
    const basic = emptyProfile().basic;
    const onChange = vi.fn();
    render(<ObjectForm fields={BASIC_FIELDS} value={basic} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText('姓名'), { target: { value: '王五' } });
    expect(onChange).toHaveBeenCalledWith({ ...basic, name: '王五' });
    expect(basic.name).toBe('');
  });

  it('commits lines fields on blur', () => {
    const exp = emptyExperience();
    const onChange = vi.fn();
    render(<ObjectForm fields={EXPERIENCE_FIELDS} value={exp} onChange={onChange} />);
    const box = screen.getByLabelText('经历描述（每行一条）');
    fireEvent.input(box, { target: { value: '做了 A\n\n做了 B' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith({ ...exp, bullets: ['做了 A', '做了 B'] });
  });

  it('toggles present for end dates', () => {
    const edu = { ...emptyEducation(), end: '2026-09' };
    const onChange = vi.fn();
    render(<ObjectForm fields={EDUCATION_FIELDS} value={edu} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('至今'));
    expect(onChange).toHaveBeenCalledWith({ ...edu, end: 'present' });
  });
});

describe('ListSection', () => {
  it('adds and removes items immutably', () => {
    const items = [{ ...emptyEducation(), school: '测试大学' }];
    const onChange = vi.fn();
    render(
      <ListSection
        title="教育经历"
        fields={EDUCATION_FIELDS}
        items={items}
        create={emptyEducation}
        onChange={onChange}
        itemLabel={(e) => e.school}
      />,
    );
    fireEvent.click(screen.getByText('+ 添加教育经历'));
    expect(onChange).toHaveBeenLastCalledWith([items[0], emptyEducation()]);
    fireEvent.click(screen.getByText('删除'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(items).toHaveLength(1);
  });
});

describe('CustomFields', () => {
  it('emits records and skips empty keys', () => {
    const onChange = vi.fn();
    render(<CustomFields value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ 添加字段'));
    expect(onChange).toHaveBeenLastCalledWith({});
    fireEvent.input(screen.getByLabelText('字段名 1'), { target: { value: '是否接受调剂' } });
    fireEvent.input(screen.getByLabelText('字段值 1'), { target: { value: '是' } });
    expect(onChange).toHaveBeenLastCalledWith({ 是否接受调剂: '是' });
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/shared/immutable.test.ts tests/options/components.test.tsx`
预期：FAIL，报错找不到模块

- [ ] **Step 3: 实现**

`src/shared/immutable.ts`：
```ts
export function updateAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((current, i) => (i === index ? item : current));
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  return items.filter((_, i) => i !== index);
}
```

`src/entrypoints/options/fields.ts`：
```ts
export type FieldKind = 'text' | 'date' | 'month' | 'lines' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: readonly { value: string; label: string }[];
  allowPresent?: boolean;
}

const DEGREES = [
  { value: '', label: '—' },
  { value: 'highschool', label: '高中' },
  { value: 'associate', label: '大专' },
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'phd', label: '博士' },
] as const;

export const BASIC_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '姓名' },
  { key: 'nameEn', label: '英文名' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'gender', label: '性别', kind: 'select', options: [
    { value: '', label: '—' }, { value: 'male', label: '男' }, { value: 'female', label: '女' },
  ] },
  { key: 'birthDate', label: '出生日期', kind: 'date' },
  { key: 'idType', label: '证件类型' },
  { key: 'idNumber', label: '证件号码' },
  { key: 'nationality', label: '国籍' },
  { key: 'hometown', label: '籍贯' },
  { key: 'politicalStatus', label: '政治面貌' },
  { key: 'currentCity', label: '现居城市' },
  { key: 'address', label: '通讯地址' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: '个人网站' },
];

export const EDUCATION_FIELDS: readonly FieldDef[] = [
  { key: 'school', label: '学校' },
  { key: 'schoolEn', label: '学校英文名' },
  { key: 'degree', label: '学历', kind: 'select', options: DEGREES },
  { key: 'major', label: '专业' },
  { key: 'start', label: '入学时间', kind: 'month' },
  { key: 'end', label: '毕业时间', kind: 'month', allowPresent: true },
  { key: 'gpa', label: 'GPA' },
  { key: 'rank', label: '排名' },
  { key: 'courses', label: '主修课程' },
  { key: 'city', label: '城市' },
  { key: 'country', label: '国家' },
];

export const EXPERIENCE_FIELDS: readonly FieldDef[] = [
  { key: 'company', label: '公司' },
  { key: 'title', label: '职位' },
  { key: 'type', label: '类型', kind: 'select', options: [
    { value: 'intern', label: '实习' }, { value: 'fulltime', label: '全职' },
  ] },
  { key: 'start', label: '开始时间', kind: 'month' },
  { key: 'end', label: '结束时间', kind: 'month', allowPresent: true },
  { key: 'location', label: '地点' },
  { key: 'bullets', label: '经历描述（每行一条）', kind: 'lines' },
];

export const PROJECT_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '项目名称' },
  { key: 'role', label: '角色' },
  { key: 'start', label: '开始时间', kind: 'month' },
  { key: 'end', label: '结束时间', kind: 'month', allowPresent: true },
  { key: 'tech', label: '技术栈（每行一个）', kind: 'lines' },
  { key: 'bullets', label: '项目描述（每行一条）', kind: 'lines' },
];

export const AWARD_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '奖项名称' },
  { key: 'date', label: '获奖时间', kind: 'month' },
  { key: 'level', label: '级别' },
];

export const SKILLS_FIELDS: readonly FieldDef[] = [
  { key: 'languages', label: '编程语言（每行一个）', kind: 'lines' },
  { key: 'frameworks', label: '框架 / 库（每行一个）', kind: 'lines' },
  { key: 'tools', label: '工具（每行一个）', kind: 'lines' },
  { key: 'langCerts', label: '语言证书（每行一个，如 雅思 7）', kind: 'lines' },
];

export const PREFERENCES_FIELDS: readonly FieldDef[] = [
  { key: 'expectedCities', label: '期望城市（每行一个）', kind: 'lines' },
  { key: 'expectedSalary', label: '期望薪资' },
  { key: 'availableFrom', label: '最早到岗时间', kind: 'month' },
  { key: 'jobTypes', label: '求职类型（每行一个）', kind: 'lines' },
];
```

`src/entrypoints/options/LinesInput.tsx`：
```tsx
import { useEffect, useState } from 'preact/hooks';

export function splitLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean);
}

interface Props {
  id: string;
  value: readonly string[];
  onChange: (lines: string[]) => void;
}

/** 输入时只更新本地草稿，失焦后才提交，这样换行和空行不会被立即吞掉。 */
export function LinesInput({ id, value, onChange }: Props) {
  const joined = value.join('\n');
  const [draft, setDraft] = useState(joined);
  useEffect(() => setDraft(joined), [joined]);
  return (
    <textarea
      id={id}
      rows={3}
      value={draft}
      onInput={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => onChange(splitLines(draft))}
    />
  );
}
```

`src/entrypoints/options/FieldInput.tsx`：
```tsx
import { useId } from 'preact/hooks';
import type { FieldDef } from './fields';
import { LinesInput } from './LinesInput';

type Value = string | string[];

interface Props {
  def: FieldDef;
  value: unknown;
  onChange: (value: Value) => void;
}

const toText = (value: unknown) => (typeof value === 'string' ? value : '');
const toList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];

function MonthInput({ id, value, allowPresent, onChange }: {
  id: string; value: string; allowPresent?: boolean; onChange: (value: string) => void;
}) {
  const isPresent = value === 'present';
  return (
    <span class="month">
      <input id={id} type="month" value={isPresent ? '' : value} disabled={isPresent}
        onInput={(e) => onChange(e.currentTarget.value)} />
      {allowPresent && (
        <label>
          <input type="checkbox" checked={isPresent}
            onChange={(e) => onChange(e.currentTarget.checked ? 'present' : '')} />
          至今
        </label>
      )}
    </span>
  );
}

function Control({ id, def, value, onChange }: Props & { id: string }) {
  switch (def.kind ?? 'text') {
    case 'lines':
      return <LinesInput id={id} value={toList(value)} onChange={onChange} />;
    case 'select':
      return (
        <select id={id} value={toText(value)} onChange={(e) => onChange(e.currentTarget.value)}>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'month':
      return <MonthInput id={id} value={toText(value)} allowPresent={def.allowPresent} onChange={onChange} />;
    case 'date':
      return <input id={id} type="date" value={toText(value)} onInput={(e) => onChange(e.currentTarget.value)} />;
    default:
      return <input id={id} type="text" value={toText(value)} onInput={(e) => onChange(e.currentTarget.value)} />;
  }
}

export function FieldInput(props: Props) {
  const id = useId();
  return (
    <div class="field">
      <label for={id}>{props.def.label}</label>
      <Control id={id} {...props} />
    </div>
  );
}
```

`src/entrypoints/options/ObjectForm.tsx`：
```tsx
import { FieldInput } from './FieldInput';
import type { FieldDef } from './fields';

interface Props<T> {
  fields: readonly FieldDef[];
  value: T;
  onChange: (next: T) => void;
}

export function ObjectForm<T extends Record<string, unknown>>({ fields, value, onChange }: Props<T>) {
  return (
    <div class="grid">
      {fields.map((def) => (
        <FieldInput
          key={def.key}
          def={def}
          value={value[def.key]}
          onChange={(fieldValue) => onChange({ ...value, [def.key]: fieldValue } as T)}
        />
      ))}
    </div>
  );
}
```

`src/entrypoints/options/ListSection.tsx`：
```tsx
import { removeAt, updateAt } from '@/shared/immutable';
import type { FieldDef } from './fields';
import { ObjectForm } from './ObjectForm';

interface Props<T> {
  title: string;
  fields: readonly FieldDef[];
  items: readonly T[];
  create: () => T;
  onChange: (items: T[]) => void;
  itemLabel: (item: T, index: number) => string;
}

export function ListSection<T extends Record<string, unknown>>(props: Props<T>) {
  const { title, fields, items, create, onChange, itemLabel } = props;
  return (
    <section>
      <h2>{title}</h2>
      {items.map((item, i) => (
        <fieldset key={i}>
          <legend>{itemLabel(item, i) || `${title} ${i + 1}`}</legend>
          <ObjectForm fields={fields} value={item} onChange={(next) => onChange(updateAt(items, i, next))} />
          <button type="button" onClick={() => onChange(removeAt(items, i))}>删除</button>
        </fieldset>
      ))}
      <button type="button" onClick={() => onChange([...items, create()])}>+ 添加{title}</button>
    </section>
  );
}
```

`src/entrypoints/options/CustomFields.tsx`：
```tsx
import { useState } from 'preact/hooks';
import { removeAt, updateAt } from '@/shared/immutable';

type Entry = readonly [string, string];

interface Props {
  value: Readonly<Record<string, string>>;
  onChange: (next: Record<string, string>) => void;
}

/** 编辑中的空 key 行只保留在本地，提交给上层时过滤掉。 */
export function CustomFields({ value, onChange }: Props) {
  const [entries, setEntries] = useState<readonly Entry[]>(() => Object.entries(value));

  const commit = (next: readonly Entry[]) => {
    setEntries(next);
    onChange(Object.fromEntries(next.filter(([key]) => key.trim() !== '')));
  };

  return (
    <section>
      <h2>自定义字段</h2>
      <p class="hint">简历里没有、但网申常问的内容，例如“是否接受调剂”。</p>
      {entries.map(([key, text], i) => (
        <div class="row" key={i}>
          <input aria-label={`字段名 ${i + 1}`} value={key}
            onInput={(e) => commit(updateAt(entries, i, [e.currentTarget.value, text] as const))} />
          <input aria-label={`字段值 ${i + 1}`} value={text}
            onInput={(e) => commit(updateAt(entries, i, [key, e.currentTarget.value] as const))} />
          <button type="button" onClick={() => commit(removeAt(entries, i))}>删除</button>
        </div>
      ))}
      <button type="button" onClick={() => commit([...entries, ['', ''] as const])}>+ 添加字段</button>
    </section>
  );
}
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/shared/immutable.test.ts tests/options/components.test.tsx`
预期：PASS（8 个测试）

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add config-driven profile form components"
```

---

### Task 9: Options 页面组装（档案编辑、保存、安全设置）

**Files:**
- Create: `src/entrypoints/options/ProfileEditor.tsx`, `src/entrypoints/options/PrefsForm.tsx`, `src/entrypoints/options/App.tsx`
- Modify: `src/entrypoints/options/main.tsx`（整个文件替换）
- Test: `tests/options/options-app.test.tsx`

**Interfaces:**
- Consumes: Task 8 的全部组件和字段定义；Task 7 的 `call`、`ApiError`、`errorText`；Task 2 的 `ProfileSchema`、`Profile`、`Prefs` 和各个 `empty*` 工厂
- Produces: `firstIssue(profile: Profile): string | null`；`<ProfileEditor initial onSave />`；`<PrefsForm />`；`<App />`

- [ ] **Step 1: 写失败测试**

`tests/options/options-app.test.tsx`：
```tsx
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/options/App';
import { firstIssue, ProfileEditor } from '@/entrypoints/options/ProfileEditor';
import { ApiError, call } from '@/shared/client';
import { emptyEducation, emptyProfile } from '@/shared/schema/profile';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));

const mockCall = vi.mocked(call);

function backend(handlers: Record<string, (req: Record<string, unknown>) => unknown>) {
  mockCall.mockImplementation((async (req: { type: string }) => {
    const handler = handlers[req.type];
    if (!handler) throw new Error(`unexpected ${req.type}`);
    return handler(req as Record<string, unknown>);
  }) as never);
}

beforeEach(() => mockCall.mockReset());
afterEach(cleanup);

describe('firstIssue', () => {
  it('returns null for a valid profile and a path-prefixed message otherwise', () => {
    expect(firstIssue(emptyProfile())).toBeNull();
    const bad = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    expect(firstIssue(bad)).toMatch(/^education\.0\.start：/);
  });
});

describe('ProfileEditor', () => {
  it('blocks saving invalid data without calling onSave', async () => {
    const onSave = vi.fn();
    const bad = { ...emptyProfile(), education: [{ ...emptyEducation(), start: '2025.09' }] };
    render(<ProfileEditor initial={bad} onSave={onSave} />);
    fireEvent.click(screen.getByText('加密保存'));
    await screen.findByText(/education\.0\.start/);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('options App', () => {
  it('explains how to unlock when the vault is locked', async () => {
    backend({ 'profile.get': () => { throw new ApiError('LOCKED', '数据已上锁，请先解锁'); } });
    render(<App />);
    await screen.findByText(/档案已上锁/);
  });

  it('explains how to start when the vault is not initialized', async () => {
    backend({ 'profile.get': () => { throw new ApiError('NOT_INITIALIZED', '尚未设置主密码'); } });
    render(<App />);
    await screen.findByText(/尚未创建档案/);
  });

  it('loads, edits and saves the profile', async () => {
    const saved: unknown[] = [];
    backend({
      'profile.get': () => emptyProfile(),
      'profile.save': (req) => { saved.push(req.profile); return null; },
      'prefs.get': () => ({ autoLockMinutes: 60 }),
    });
    render(<App />);
    const name = await screen.findByLabelText('姓名');
    fireEvent.input(name, { target: { value: '赵六' } });
    fireEvent.click(screen.getByText('加密保存'));
    await screen.findByText('已加密保存');
    expect(saved).toEqual([{ ...emptyProfile(), basic: { ...emptyProfile().basic, name: '赵六' } }]);
  });

  it('saves auto-lock preference', async () => {
    backend({
      'profile.get': () => emptyProfile(),
      'prefs.get': () => ({ autoLockMinutes: 60 }),
      'prefs.save': () => null,
    });
    render(<App />);
    const select = await screen.findByLabelText('自动上锁');
    fireEvent.change(select, { target: { value: '15' } });
    await waitFor(() =>
      expect(mockCall).toHaveBeenCalledWith({ type: 'prefs.save', prefs: { autoLockMinutes: 15 } }),
    );
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

运行：`npx vitest run tests/options/options-app.test.tsx`
预期：FAIL，报错找不到模块

- [ ] **Step 3: 实现**

`src/entrypoints/options/ProfileEditor.tsx`：
```tsx
import { useState } from 'preact/hooks';
import * as v from 'valibot';
import { errorText } from '@/shared/client';
import {
  emptyAward, emptyEducation, emptyExperience, emptyProject, type Profile, ProfileSchema,
} from '@/shared/schema/profile';
import { CustomFields } from './CustomFields';
import {
  AWARD_FIELDS, BASIC_FIELDS, EDUCATION_FIELDS, EXPERIENCE_FIELDS, PREFERENCES_FIELDS, PROJECT_FIELDS, SKILLS_FIELDS,
} from './fields';
import { ListSection } from './ListSection';
import { ObjectForm } from './ObjectForm';

export function firstIssue(profile: Profile): string | null {
  const result = v.safeParse(ProfileSchema, profile);
  if (result.success) return null;
  const issue = result.issues[0];
  const path = v.getDotPath(issue);
  return path ? `${path}：${issue.message}` : issue.message;
}

interface Props {
  initial: Profile;
  onSave: (profile: Profile) => Promise<void>;
}

type Notice = { kind: 'ok' | 'error'; text: string };

export function ProfileEditor({ initial, onSave }: Props) {
  const [draft, setDraft] = useState<Profile>(initial);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);

  const patch = <K extends keyof Profile>(key: K) => (value: Profile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const problem = firstIssue(draft);
    if (problem) {
      setNotice({ kind: 'error', text: problem });
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setNotice({ kind: 'ok', text: '已加密保存' });
    } catch (error) {
      setNotice({ kind: 'error', text: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <section>
        <h2>基本信息</h2>
        <ObjectForm fields={BASIC_FIELDS} value={draft.basic} onChange={patch('basic')} />
      </section>
      <ListSection title="教育经历" fields={EDUCATION_FIELDS} items={draft.education}
        create={emptyEducation} onChange={patch('education')} itemLabel={(e) => e.school} />
      <ListSection title="实习 / 工作经历" fields={EXPERIENCE_FIELDS} items={draft.experience}
        create={emptyExperience} onChange={patch('experience')} itemLabel={(e) => e.company} />
      <ListSection title="项目经历" fields={PROJECT_FIELDS} items={draft.projects}
        create={emptyProject} onChange={patch('projects')} itemLabel={(p) => p.name} />
      <section>
        <h2>技能</h2>
        <ObjectForm fields={SKILLS_FIELDS} value={draft.skills} onChange={patch('skills')} />
      </section>
      <ListSection title="荣誉奖项" fields={AWARD_FIELDS} items={draft.awards}
        create={emptyAward} onChange={patch('awards')} itemLabel={(a) => a.name} />
      <section>
        <h2>求职偏好</h2>
        <ObjectForm fields={PREFERENCES_FIELDS} value={draft.preferences} onChange={patch('preferences')} />
      </section>
      <CustomFields value={draft.custom} onChange={patch('custom')} />
      <p class="row">
        <button type="button" class="primary" disabled={saving} onClick={() => void save()}>加密保存</button>
        {notice && <span class={notice.kind} role="status">{notice.text}</span>}
      </p>
    </div>
  );
}
```

`src/entrypoints/options/PrefsForm.tsx`：
```tsx
import { useEffect, useState } from 'preact/hooks';
import { call, errorText } from '@/shared/client';
import type { Prefs } from '@/shared/schema/prefs';

const OPTIONS: readonly { value: Prefs['autoLockMinutes']; label: string }[] = [
  { value: 15, label: '闲置 15 分钟' },
  { value: 60, label: '闲置 1 小时' },
  { value: 0, label: '直到关闭浏览器' },
];

export function PrefsForm() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    call({ type: 'prefs.get' }).then(setPrefs).catch((e) => setError(errorText(e)));
  }, []);

  const change = async (autoLockMinutes: Prefs['autoLockMinutes']) => {
    const next: Prefs = { autoLockMinutes };
    try {
      await call({ type: 'prefs.save', prefs: next });
      setPrefs(next);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <section>
      <h2>安全设置</h2>
      {prefs && (
        <label>
          自动上锁
          <select value={String(prefs.autoLockMinutes)}
            onChange={(e) => void change(Number(e.currentTarget.value) as Prefs['autoLockMinutes'])}>
            {OPTIONS.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
}
```

`src/entrypoints/options/App.tsx`：
```tsx
import { useEffect, useState } from 'preact/hooks';
import { ApiError, call, errorText } from '@/shared/client';
import type { Profile } from '@/shared/schema/profile';
import { PrefsForm } from './PrefsForm';
import { ProfileEditor } from './ProfileEditor';

type View =
  | { kind: 'loading' }
  | { kind: 'blocked'; text: string }
  | { kind: 'ready'; profile: Profile };

function blockedText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'LOCKED') {
    return '档案已上锁：请点击浏览器工具栏中的 ResumeSub 图标，输入主密码解锁。';
  }
  if (error instanceof ApiError && error.code === 'NOT_INITIALIZED') {
    return '尚未创建档案：请先点击工具栏中的 ResumeSub 图标设置主密码。';
  }
  return errorText(error);
}

export function App() {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const load = async () => {
    setView({ kind: 'loading' });
    try {
      setView({ kind: 'ready', profile: await call({ type: 'profile.get' }) });
    } catch (error) {
      setView({ kind: 'blocked', text: blockedText(error) });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (profile: Profile) => {
    await call({ type: 'profile.save', profile });
  };

  return (
    <main class="options">
      <h1>ResumeSub 档案</h1>
      {view.kind === 'loading' && <p>加载中…</p>}
      {view.kind === 'blocked' && (
        <div>
          <p role="alert">{view.text}</p>
          <button type="button" onClick={() => void load()}>我已解锁，重新加载</button>
        </div>
      )}
      {view.kind === 'ready' && (
        <>
          <ProfileEditor initial={view.profile} onSave={save} />
          <PrefsForm />
        </>
      )}
    </main>
  );
}
```

`src/entrypoints/options/main.tsx`（整个文件替换）：
```tsx
import { render } from 'preact';
import '@/ui/base.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 4: 运行测试，确认通过**

运行：`npx vitest run tests/options/options-app.test.tsx`
预期：PASS（6 个测试）

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: add options page with encrypted profile editing"
```

---

### Task 10: M1 验收

**Files:** 不新增文件（只有在发现问题时才修改相关文件）

- [ ] **Step 1: 全量测试，加覆盖率**

运行：`npm run coverage`
预期：全部测试 PASS，lines、functions、branches、statements 四项都 ≥ 80%。如果某项不足，给覆盖率最低的文件补测试，不要降低阈值。

- [ ] **Step 2: 类型检查和构建**

运行：`npm run compile && npm run build`
预期：没有错误；`.output/chrome-mv3/manifest.json` 中 `permissions` 为 `["storage","alarms"]`，并且没有 `host_permissions`。

- [ ] **Step 3: 手动加载验证（在 Chrome 中）**

1. 打开 `chrome://extensions`，开启"开发者模式"，点"加载已解压的扩展程序"，选择 `.output/chrome-mv3`
2. 点击工具栏图标，设置主密码（先试 9 位，应提示"至少 10 位"），然后用正确的密码完成设置，显示"✅ 已解锁"
3. 点"编辑档案"，填写姓名并添加一段教育经历（结束时间勾选"至今"），点"加密保存"，显示"已加密保存"
4. 在 DevTools 中打开 background service worker 的控制台，执行 `chrome.storage.local.get('vault').then(console.log)`：确认只能看到 base64 密文，搜不到刚填的姓名
5. 在 popup 中点"立即上锁"，刷新 options 页，应显示"档案已上锁"
6. 连续输错 5 次密码，第 6 次即使输入正确密码也会提示"尝试次数过多"；等待 30 秒后可以正常解锁
7. 解锁后刷新 options 页，第 3 步保存的数据完整显示

- [ ] **Step 4: Commit（如果前面有修复）**

```bash
git add -A
git commit -m "test: raise coverage for M1 acceptance"
```
