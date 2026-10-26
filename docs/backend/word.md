# Word 引用集成（macOS 原型）

## 状态与范围

原型接收未修改的 Zotero Word 模板命令，由 Agentero 独立驱动 Microsoft Word。当前实现仅面向 macOS 的正文引文；真实 Word 验收结果记录在开发设计稿。Windows 在 macOS 闭环验收后实施。

支持 Add/Edit Citation、Add/Edit Bibliography、Document Preferences、Refresh。所有操作在 Agentero 对话框确认后执行；取消不写 Word。多篇引文可带共同页码，样式包括 APA 7、IEEE、Chicago author-date。排版使用本地 Hayagriva 0.10.1 与其内置 CSL 样式/locale，无联网依赖。

原型暂将 CSL 输出写为纯文本字段结果，不保留期刊级斜体、悬挂缩进等富文本排版。暂不支持脚注/尾注、修订模式、Unlink、旧 Zotero 文档迁移及双向编辑兼容；遇到外部 Zotero 字段会拒绝写入，不自动迁移。它复用官方插件入口，不表示实现了 Zotero 的全部文档协议。

## 启用

安装官方 macOS `Zotero.dotm` 和 `Zotero.scpt`，按 Zotero 官方安装路径放置并重启 Word。在 Agentero 打开本地 Vault，开启 Connector，再打开「Zotero Word 插件（macOS 原型）」开关。开关仅对当前进程有效；退出重启后默认关闭。退出 Zotero Desktop 后才能启用。默认端口为 23119；若自定义 Connector 端口，需要用户已有的 `ZoteroPort.txt` 与之匹配。

首次驱动 Word 需要 macOS Automation 授权。打包配置提供 AppleEvents usage description 和 hardened-runtime entitlement；开发启动时授权可能归属于启动终端，发布包仍需独立验收。

## 实现

- `src-tauri/src/integration/connector/server.rs`：`GET /integration/macWordCommand`，校验 Host、拒绝浏览器 Origin/Fetch Metadata、检查 agent/version/command。传来的 `document` 是 Word 应用路径，仅用于校验，不作为执行或文件操作路径。
- `src-tauri/src/integration/word/`：进程级互斥请求、Catalog 快照、CSL 排版、字段 codec 与 macOS 驱动。
- `mac-word.js`：独立编写的 JXA driver，通过系统 osascript 与 Word 的正式脚本字典通信，不加载 Zotero 的 dylib。输入以权限受限的临时 JSON 文件传入，用户文本不拼接到可执行脚本。
- `WordCitationDialog`：主界面论文选择、页码与样式。Host 保留请求快照；前端只提交请求 ID、论文 ID 与有限选项。

HTTP 在后台自动化前返回，以满足官方宏约两秒的超时。一个进程最多一个请求；提交时复核 Vault、请求 ID、有效期、活动文档身份、内容、字段和光标。变化时拒绝写入，用户从 Word 重新发起。

## 持久化

引文字段使用 `ADDIN ZOTERO_ITEM CSL_CITATION` 前缀，payload 带完整 CSL item snapshot 和 `agentero.version=1` 标记。参考文献使用 `ADDIN ZOTERO_BIBL`，同样标识 Agentero 所有权。样式随引文字段保存；Document Preferences 更新已有引文的样式，空文档在首次插入时选择样式。字段结果可被没有 Agentero 的 Word 用户阅读。

每次操作重新读取 Word 文档；不依赖内存 session 才能恢复。刷新按文档顺序重建 CSL processor，相同论文复用一个 processor entry，避免重复编号。当前 Catalog 有对应 ID 时更新 metadata；没有时使用字段内快照。Word 自己负责保存，Agentero 不覆盖 `.docx` 文件。

## 限制与后续

- 真实 Office 保存/重开/刷新/撤销、安装与授权验收是发布前置；编译和单测不替代实测。
- 当前应用字段写入由多次 Word 自动化调用完成，不是原子事务；超时或 Word 中途退出后需检查文档，可用快照与重新刷新恢复。不得声称一次撤销总能回滚整组操作。
- 需要进一步验证多窗口、长文档、复制粘贴重复 citation ID 和中文作者。
- Windows receiver/COM driver、富文本 CSL 输出、脚注与迁移沿用 [设计稿](../development/zotero-word-integration.md) 的后续阶段。


正式分发前需补齐 Hayagriva 与其 CSL 资源要求的版权声明；当前不随本地原型打包许可证副本。

Word 请求唤起主窗口时，取消最小化仅在桌面平台编译，避免 Android 引用 Tauri 不提供的窗口 API。
