<p align="center">
  <img src="public/icon/128.png" width="96" alt="ResumeSub" />
</p>

<h1 align="center">ResumeSub</h1>

<p align="center">
  浏览器扩展：导入一次简历，打开网申页面就自动填好。<br />
  全程在本地完成，不联网、不上传、不需要账号。
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-0.5.0-2563eb" />
  <img alt="manifest" src="https://img.shields.io/badge/Chrome%20%2F%20Edge-Manifest%20V3-15803d" />
  <img alt="tests" src="https://img.shields.io/badge/tests-446%20passing-15803d" />
</p>

---

## 功能

- **简历解析**：导入 PDF 或 DOCX 简历，自动提取基本信息、教育、实习和工作、项目、技能、奖项。支持常见的中文和英文模板，导入后会把原文和解析结果并排显示，方便校对。
- **打开即填**：在你授权过的招聘网站上，页面加载完就自动填写。多步表单进入下一步时会继续填写。
- **覆盖常见控件**：
  - 文本框、多行文本、原生下拉框、单选按钮；
  - 简历附件上传，会自动放入你导入的那份文件；
  - Ant Design 和 Element UI/Plus 的自定义下拉框与日期选择器；
  - 可重复的区块：档案里有两段教育经历、页面上只有一块时，会自动点"添加"补出第二块再填。
- **一眼看清结果**：已填字段显示绿框，没填的显示灰色虚线框。右下角显示"已填 N · 未填 M"，点它可以跳到下一个没填的字段。
- **不会替你做决定**：不会点"下一步"或"提交"，不会覆盖你已经填好的内容，不会回答开放式问答题。
- **界面**：弹窗显示当前网站的状态，可以一键启用；设置页分为档案、导入简历、自动填写网站、数据与隐私四页；支持深色模式。

## 安装

### 方式一：直接加载构建好的扩展

1. 从 [Releases](https://github.com/zhanjianbirui/ResumeSub/releases) 下载 `resumesub-x.y.z-chrome.zip` 并解压。也可以按方式二自己构建。
2. 打开 `chrome://extensions`（Edge 打开 `edge://extensions`），在右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选中解压出来的文件夹。
4. 把 ResumeSub 固定到工具栏。

### 方式二：从源码构建

```bash
git clone https://github.com/zhanjianbirui/ResumeSub.git
cd ResumeSub
npm install
npm run build        # 产物在 .output/chrome-mv3
npm run zip          # 打包为 .output/resumesub-<version>-chrome.zip
```

然后按方式一的第 2–4 步加载 `.output/chrome-mv3` 文件夹。

## 使用

1. **导入简历**：点击工具栏图标，再点"导入简历开始使用"，选择 PDF 或 DOCX 文件，校对解析结果后保存。
2. **补充信息**：在"档案"页填写简历里通常没有、但网申经常要求的内容，比如证件号、政治面貌、期望城市。网站上特有的问题可以写在"自定义字段"里，例如"是否接受调剂"。
3. **授权网站**：打开网申页面，点击工具栏图标，再点"在此网站启用自动填写"。也可以在设置页的"自动填写网站"里一键授权常见招聘系统，包括 Workday、Greenhouse、Lever、SmartRecruiters、SuccessFactors、北森、Moka、飞书招聘、牛客等。
4. **检查并提交**：页面会自动填好。检查绿框和灰框的字段，补齐没填的内容后，由你自己提交。

## 隐私与安全

- 档案和简历文件**只保存在本机浏览器里**，使用插件自动生成的 AES-256-GCM 密钥加密，不需要密码。
- 插件**不发起任何网络请求**，没有统计，也没有遥测。
- 只有你授权过的网站会运行填写脚本。插件不申请"读取所有网站"的权限。
- 网页里的脚本拿不到完整档案：它只把表单字段的标签发给后台，后台只返回**这一页需要填的值**。
- 对恶意页面的防护：
  - 隐藏字段、屏幕外的"蜜罐"字段、透明字段都不会被填写；
  - "紧急联系人""监护人"这类别人的信息栏不会填你本人的信息；
  - 简历文件只会放进标明是"简历"的上传框；
  - 被其他网站用 iframe 嵌入时不会运行。
- 需要注意：能直接读取你电脑上浏览器数据目录的人可以解开档案。请保护好电脑本身的安全。

## 技术栈

| 部分 | 选型 |
|---|---|
| 扩展框架 | [WXT](https://wxt.dev)（Manifest V3） |
| 界面 | Preact + 原生 CSS（设计变量、深色模式） |
| 数据校验 | valibot |
| 简历解析 | pdf.js、mammoth（只在设置页按需加载），以及基于规则的中英文解析器 |
| 加密 | WebCrypto AES-256-GCM |
| 测试 | Vitest + happy-dom；E2E 使用 Playwright 加载扩展，在真实的 Ant Design 和 Element Plus 页面上验证 |

网页端的填写脚本没有任何第三方依赖，构建后约 27KB。

## 项目结构

```
src/
  entrypoints/        扩展入口：background、popup、options、autofill.content
  background/         后台：加密档案（vault）、消息路由、字段匹配与填写计划、站点授权
  content/            网页端：表单扫描、组件识别、填写器、可重复区块、浮层
  parser/             简历文本 → 结构化档案（规则解析）
  extract/            PDF / DOCX → 文本行
  import/             导入流程编排
  shared/             共享类型、schema、消息协议
public/icon/          扩展图标
tests/                单元测试和集成测试
docs/                 设计文档、计划与待办
```

## 开发

```bash
npm run dev        # 开发模式（热更新）
npm test           # 运行全部测试
npm run coverage   # 覆盖率报告
npm run compile    # TypeScript 类型检查
```

## 路线图

- [x] 本地加密档案与简历解析（PDF / DOCX）
- [x] 规则匹配的自动填写：文本框、下拉框、单选、文件上传
- [x] 复杂控件：自定义下拉框、日期选择器、可重复区块
- [x] 免密码与新界面（v0.5.0）
- [ ] 可选的大模型兜底：规则匹配不上的字段只把标签发给模型，个人数据不发送；学到的映射按网站记住
- [ ] 开放题助手：答案库和草稿生成
- [ ] Workday、北森等站点专用适配器（欢迎提供真实页面的 HTML 样本）
- [ ] 多选下拉框，以及加密备份的导入和导出

待处理的细节记录在 [`docs/superpowers/m1-followups.md`](docs/superpowers/m1-followups.md)。

## 反馈

遇到填写不准确的网站，欢迎提交 Issue，附上网站名称和字段截图。如果方便，在网申页按 Ctrl+S 保存一份空白表单的 HTML 附上，**请先确认里面没有个人信息**。
