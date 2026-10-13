# ResumeSub —— 简历投递自动填写插件 设计文档

- 日期：2026-10-13
- 状态：已确认设计，待编写实施计划

## 1. 目标与范围

一个面向个人和他人分发的浏览器扩展：

1. 导入简历（PDF / DOCX），解析为结构化档案，用户校对、补充后**加密保存在本地**。
2. 在已授权的招聘网站上**打开页面即自动填写**，用户检查后自行提交。
3. 开放式问答题：本地答案库匹配 + 可选大模型生成草稿。
4. 数据安全：主密码加密、最小权限、严格的隐私边界、零遥测。

**目标网站**：海外 ATS（Workday、Greenhouse、Lever、SuccessFactors 等）和国内校招系统（北森、Moka、飞书招聘、牛客、大厂官网等）。

**非目标（明确不做）**：
- 自动点击"下一步"或"提交"
- 自动填写开放题（只给按钮，由用户触发）
- 依赖本地大模型（Ollama 等）
- 云端同步、账号体系、任何数据上报
- 第一版不做 Workday、北森以外的专用适配器

## 2. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 扩展框架 | WXT（Manifest V3） | 维护活跃，同时支持 Chrome/Edge/Firefox |
| 语言 | TypeScript | |
| UI | Preact + 手写 CSS | 轻量，约 3KB |
| 数据校验 | valibot | 体积小 |
| PDF 解析 | pdf.js（仅在 Options 页懒加载） | |
| DOCX 解析 | mammoth（仅在 Options 页懒加载） | |
| 加密 | WebCrypto（PBKDF2 + AES-GCM） | 零依赖 |
| 大模型调用 | 原生 fetch | 不引入 SDK |
| 测试 | Vitest + happy-dom；Playwright | |

**轻量化指标**：content script 打包后小于 50KB；popup 不包含解析库。

## 3. 架构

```
Popup (Preact)          Options 页 (Preact)
 ├ 解锁、本页状态           ├ 简历导入、解析校对
 └ 开放题助手              ├ 档案、答案库编辑
                          └ 大模型、安全、站点授权设置
        │   typed messages   │
        ▼                    ▼
Background Service Worker（唯一接触明文档案的组件）
 ├ vault/     加密存储、解锁、自动上锁
 ├ profile/   档案读写与校验
 ├ llm/       模型接口适配、脱敏、调用日志
 ├ mapping/   映射记忆（按域名）
 ├ matcher/   记忆 → 规则词典 → 大模型兜底
 └ planner/   匹配结果 → 填写计划（取值、格式转换）
        ▲ 上行 FieldDescriptor[]   ▼ 下行只含 [{signature, value}]
        │
Content Script（仅注入已授权域名）
 ├ scanner/   表单扫描 → 字段描述
 ├ filler/    各类控件填写器
 ├ overlay/   closed Shadow DOM 浮层、字段标注
 └ adapters/  workday、beisen
```

**原则**
- Content script 永远拿不到完整档案，只收到本页要填的值。
- 不申请 `<all_urls>`。按域名用 `chrome.permissions.request` 申请权限，再用 `chrome.scripting.registerContentScripts` 动态注册。
- 按功能划分目录，单个文件不超过 400 行，函数不超过 50 行，采用不可变数据写法。

## 4. 数据模型

```ts
Profile {
  basic: { name, nameEn?, phone, email, gender?, birthDate?, idType?, idNumber?,
           nationality?, hometown?, politicalStatus?, currentCity?, address?,
           linkedin?, github?, website? }
  education:  { school, schoolEn?, degree, major, start, end, gpa?, rank?,
                courses?, city?, country? }[]
  experience: { company, title, start, end, type: 'intern'|'fulltime',
                location?, bullets: string[] }[]
  projects:   { name, role?, start, end, tech: string[], bullets: string[] }[]
  skills:     { languages: string[], frameworks: string[], tools: string[], langCerts: string[] }
  awards:     { name, date?, level? }[]
  preferences:{ expectedCities: string[], expectedSalary?, availableFrom?, jobTypes: string[] }
  custom:     Record<string, string>
}
AnswerBank  = { id, question, answer, lang: 'zh'|'en', tags: string[] }[]
SiteMapping = Record<domain, Record<fieldSignature, profilePath>>
ResumeFile  = { name, mime, bytes }
Settings    = { llm: { provider, baseUrl, model, apiKey }, offlineMode, autoLockMinutes }
```

- 已授权自动填写的网站不存进 Settings，以 `chrome.permissions`（optional_host_permissions 的授权结果）为唯一来源；授权或撤销后后台同步 content script 的注册。

- 日期统一存为 `YYYY-MM` 或 `present`，填写时再转换成目标格式。
- 以上所有数据作为一个 vault 整体加密存储。

## 5. 简历解析

**本地规则解析（默认）**
1. pdf.js 提取文本行及坐标，按 y 坐标合并成行，识别加粗或大字号的行作为候选标题。
2. 区块切分：匹配中英文标题词典（教育背景/Education、项目经验/Projects、实习经验/工作经历/Experience、技能/Skills、荣誉奖项/Awards…）。
3. 字段抽取：
   - 正则匹配手机号、邮箱、URL。
   - 识别日期区间，如 `2025.09 – 2026.09`、`2023/07-至今`、`Sep 2023 – Present`。
   - 条目行中，日期区间左边是机构名，下一行是学位、专业或职位。
   - `•` 开头的行作为 bullet。
4. 输出 `Partial<Profile>`，每个字段带置信度，低置信度字段在校对 UI 中标黄。

**大模型解析（可选）**：把全文发给模型，要求输出符合 Profile schema 的 JSON，用 valibot 校验，失败重试一次。

**校对 UI**：左边显示原文，右边是表单。用户修改并补充简历里没有的字段（身份证号、政治面貌等）后保存。原始文件存为 ResumeFile。

## 6. 填表引擎

**触发**：已授权域名的页面加载后，用 MutationObserver 等 DOM 稳定约 500ms 再执行。多步表单出现新表单时自动再执行一轮。

**流程**：扫描 → 匹配 → 生成计划 → 填写 → 标注

1. **scanner**：遍历可见控件（包括同源 iframe），生成 `FieldDescriptor { signature, label, placeholder, nameAttr, type, options?, sectionHeading, repeatIndex? }`。
   - 标签获取优先级：`label[for]` > `aria-label` / `aria-labelledby` > 最近的文本节点。
   - 按 ARIA 角色识别自定义下拉框（listbox / combobox，以及 Ant Design、Element UI 的常见结构）。
   - `signature = hash(normalize(label) + nameAttr + sectionHeading)`。
2. **matcher**（background 中）：依次查映射记忆 → 规则词典 → 大模型批量兜底（只发标签、选项和档案字段路径清单）→ 跳过。
3. **planner**（background 中）：取值，转换格式（日期、下拉选项模糊匹配、中英文学历和学位对照），生成 `[{signature, value, source: 'memory'|'rule'|'llm', confidence}]`。
4. **filler**：
   - 文本框：通过原生 value setter 设值，再派发 `input` 和 `change` 事件。
   - 原生 select：设值后派发 change 事件。
   - 自定义下拉框：模拟点击打开 → 输入关键字 → 点击匹配的选项。
   - 日期：优先直接输入，其次走 adapter 中的专用逻辑。
   - 文件：用 DataTransfer 注入 ResumeFile。
   - 可重复区块：数量不够时点击"添加"按钮，等待新区块渲染后重新扫描。
   - **已有值的字段不覆盖。**
   - 大模型给出的低置信度（< 0.7）结果不填写，只标黄并给出建议值。
5. **overlay**：绿色表示已填，黄色表示待确认，灰色虚线表示未填。右下角浮层显示统计，点击可跳转到待确认字段。

**学习**：用户在 popup 中点"记住本页修正"后，把手动修改过的字段写入 SiteMapping。

**开放题**：`textarea` 或字数要求较长的字段识别为开放题，旁边放一个按钮。点开后有两个操作：答案库按题目相似度匹配（本地、基于关键词），或让大模型生成草稿，用户编辑后再填入。

**未解锁**：浮层显示"点击解锁"，点击后打开 popup 输入密码。网页内不出现任何密码输入框。

**站点授权**：内置常见招聘域名清单，可以批量授权，也可以逐站授权。

## 7. 大模型调用与隐私边界

| 场景 | 触发 | 发送内容 | 不发送 |
|---|---|---|---|
| 简历解析 | 用户点击 | 简历全文 | — |
| 字段映射兜底 | 自动 | 字段标签、选项、区块标题、档案字段路径清单 | 任何档案值 |
| 开放题草稿 | 用户点击 | 题目、JD、`toLLMContext(profile)` | basic 中的所有身份和联系方式字段 |

- `toLLMContext` 采用**白名单**：只包含 education、experience、projects、skills、awards，外加 basic 中的姓名。
- 接口支持 `anthropic` 和 `openai-compatible` 两种，预置 Claude、OpenAI、DeepSeek、通义千问、Kimi 模板。
- 输出要求 JSON，用 valibot 校验，失败重试一次，再失败降级为"未填"。
- 调用日志只保存在本地，最多 50 条，记录时间、场景、发送内容预览和 token 数。
- 离线模式开关打开后，禁用所有大模型调用。
- 自定义 baseUrl 时按需申请 host 权限。

## 8. 加密与安全

- 密钥派生：PBKDF2-SHA256，60 万次迭代，16 字节随机 salt。
- 加密：AES-256-GCM，每次写入使用新的 12 字节随机 IV。存储格式为 `{ v:1, salt, iterations, check:{iv,ct}, data:{iv,ct} }`（`check` 加密一段固定文本，用来区分"密码错误"和"数据损坏"），放在 `chrome.storage.local`。
- 主密码至少 10 位，不保存。忘记密码后数据无法恢复，设置时会明确提示，并引导导出备份。
- 解锁后，原始密钥存放在 `chrome.storage.session`（只在内存中，默认仅扩展上下文可访问）。
- 自动上锁：用 `chrome.alarms` 实现，可选 15 分钟、1 小时（默认）或直到关闭浏览器。
- 连续输错 5 次后冷却 30 秒。
- 消息协议：所有消息都用 valibot 校验并检查 sender。content script 只能调用 `autofill.plan`（M5 起增加 `suggest`），且发送页面的 origin 必须已获用户授权；其余接口只允许扩展页面调用。
- 浮层使用 closed Shadow DOM；不使用 `eval` 和 `innerHTML`；严格 CSP；不加载远程代码。
- 零遥测，只会请求用户配置的大模型 API。
- 备份：导出加密的 `.resumevault` 文件；导出明文 JSON 需要再次输入密码并确认警告。

## 9. 错误处理

- 解析失败：提示原因（例如没有文字层的扫描件会提示"请使用含文字的 PDF 或改用 AI 解析"），并允许手动填写档案。
- 大模型错误（网络、401、429、JSON 不合法）：在 popup 中给出友好提示，填写流程降级为只用规则，不中断。
- 单个控件填写失败时只标记为"未填"并记录到控制台（debug 模式），不影响其他字段。
- vault 解密失败（密码错误或数据损坏）时，明确区分并提示两种情况；数据损坏时引导用户从备份导入。

## 10. 测试策略

- 单元测试（Vitest + happy-dom）：解析器、词典匹配、格式转换、vault、`toLLMContext`、消息校验。
- 集成测试：把 Workday、北森、Moka、Greenhouse 表单保存为 HTML 快照，跑完整的扫描 → 填写流程，大模型用 mock。
- E2E 测试（Playwright 加载扩展）：导入 → 解锁 → 自动填写 → 检查标注。
- 测试数据只使用虚构简历，真实简历不进入仓库。
- 覆盖率 ≥ 80%，采用 TDD。

## 11. 里程碑

1. **M1 基础**：WXT 脚手架、vault 加密、消息协议、Options 档案编辑（手动录入）。
2. **M2 解析**：规则解析 PDF/DOCX、校对 UI。
3. **M3 填表**：scanner、词典匹配、filler（文本框、select、文件）、overlay、站点授权与自动触发。
4. **M4 复杂控件**：自定义下拉框、日期、可重复区块，以及 Workday、北森适配器。
5. **M5 大模型**：模型接口适配、AI 解析、映射兜底、映射记忆与学习。
6. **M6 开放题**：答案库、草稿生成、调用日志、离线模式、备份导入导出。
