# M1 遗留事项（写 M5 / M6 计划时必须纳入）

## M5 之前必须完成
- vault 内部加 Promise 单通道互斥锁，包裹 setup / unlock / write：解决读-改-写不串行导致的并发写丢失，以及并发 unlock 绕过冷却

## M6（备份导入）之前必须完成
- `parseBlob`：iterations 设上下限（如 100k ≤ n ≤ 10M），防止外部导入的 blob 让 unlock 卡死
- salt/iv/ct 做 base64 合法性校验，非法时映射为 CORRUPTED，而不是原始 DOMException
- `write()` 前校验会话密钥与当前 blob 匹配（或导入时先上锁、再原子替换），防止导入后用旧密钥写坏数据
- blob 损坏时 popup 停在"加载中"，需要提供恢复（导入备份）入口

## 可择机处理
- INVALID_DATA 只返回字段路径，不拼接 valibot 原始 message（content 侧接口开放后必须）
- 显式声明 `content_security_policy.extension_pages`
- 只在已解锁时触发 autoLock.touch；autoLock.touch 失败改为尽力而为
- popup 打开期间自动上锁后的状态刷新
- `type="month"` 在 Firefox/Safari 上退化为文本框，需加格式提示
- CustomFields 重复 key 提示；LinesInput 失焦后立即保存时可能用到旧草稿
- 保存进行中继续编辑时，"已保存"提示与实际保存的数据可能不一致
- VaultStatus 统一从 `@/shared/messages` 导入
- 冷却状态在浏览器重启后重置（目前是有意的设计）

# M2 遗留事项

## M3 之前必须完成
- 填写器解码 `resumeFile.dataBase64` 前做 base64 字符集校验（或把 `atob` 失败映射为友好错误）

## 可择机处理
- 不打包 pdf.js CMaps（节省 2.4MB）：未嵌入字体的中文 PDF 可能出现乱码，兜底方案是 M5 的 AI 解析
- 导入时整体替换列表会覆盖用户手工补充的字段（gpa、rank、role、level 等），应在合并前提示"将替换现有 N 条"
- 导入或放弃导入时，编辑器里未保存的修改会丢失（目前只有提示文案）；可在有未保存内容时禁用导入
- 自动检查 bundle 隔离：构建后用脚本确认 background 和 popup 中不含 pdfjs / mammoth
- 模块层次：`extract/` 依赖 `import/errors`，可以把 ImportError 移到 `shared/`
- DOCX 文本超长时复用了 TOO_LARGE，提示文案说的是文件大小，应单独给一条文本超长的提示
- "Master of Computer Science" 这类多词学位名称的剥离；"研究生院"这类校名被误判为硕士；精确到日的日期；链接末尾带的 `)`；专业后括号里的方向说明被丢掉
- 标题识别目前只靠词典，没有用到字号（spec §5.1），可以加入字号判断

# M3 遗留事项

## M5 之前必须完成
- grantedSites / listEnabledSites / injectIntoTabs 必须排除 LLM API host（用 Prefs 维护的 LLM host 集合），避免把自动填写脚本注入到大模型接口域名，或在站点列表里把它们当成招聘网站

## 可择机处理
- 授权 `http://` 站点时提示风险（明文传输，页面可被中间人篡改后读取填入的数据）
- 页面可以探测到填写浮层（固定 id 的 host 节点）以及字段上的 `data-resumesub` 标记，考虑随机化或缩短存留时间
- 在 Firefox 上验证 `scripting.registerContentScripts` 的 `persistAcrossSessions` 行为（目前尚未在 Firefox 上验证）
- 自定义下拉框 / combobox（Ant Design Select、Element UI 等）的填写扩展点，留到 M4

# M3 遗留事项（可择机处理）
- 只有 1 个控件的重复区块（例如每段只有一个"学校"输入框）不会被识别为区块，按第 0 条记录填写；通常网申的区块都有多个字段，影响不大
- 重复区块判断中按标签文字包含的兜底规则可能误配，例如"姓名"和"紧急联系人姓名"分在两个同 class 的栏中
- 单次 autofill.plan 请求只限制了字段数和选项数，没有限制总字节数；可以在 content 端限制序列化总大小
- 跨域 iframe 防护依赖 location.ancestorOrigins，Firefox 上没有，需要另外处理
- "研究生"同义词在没有更合适的选项时，可能把"博士研究生"选成硕士
- 本地端到端验证方式：Playwright + Chromium 加载扩展，并临时预授权 localhost（只在验证用的副本里改，不提交），见本次会话的 scratchpad 脚本；之后可以用 /run-skill-generator 固化
