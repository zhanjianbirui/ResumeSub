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
