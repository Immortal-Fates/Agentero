# PDF 翻译与 BabelDOC 算法差异

## 基线与验收口径

2026-10-26 源码审计，上游固定为
[`38d3896dcde9b5a940c62cf5563cadea673a64d3`](https://github.com/funstory-ai/BabelDOC/tree/38d3896dcde9b5a940c62cf5563cadea673a64d3)。
本地初始基线 `5c781d586`。上游源码检出在仓库外，不作为 Agentero 的依赖。

目标是沿用 TypeScript / Rust / PDFium，逐项缩小行为差异。**当前不是 BabelDOC 的完整移植，不能宣称核心算法相同。**
上游是 AGPL-3.0，本项目是 MIT；本次修改不复制或逐行转写上游代码。
算法对照表描述行为与数据要求，不把上游代码作为 MIT 源码引入。

## 实现前的逐阶段对照

上游入口 `babeldoc/format/pdf/high_level.py:do_translate`：解析 IL → 扫描检测 →
版面 → 可选表格 → 段落 → 公式/样式 → 可选术语提取 → 翻译 → 重排 → PDF 写出。
以下上游路径相对 `babeldoc/format/pdf/document_il/`。

| 阶段 | BabelDOC 源码与行为 | Agentero 初始行为 | 核心差异 / 验收要求 |
|---|---|---|---|
| PDF 表示 | `frontend/`、`il_version_1.py`：字形、visual bbox、字体、图形状态、XObject、曲线、Form | PDFium rich runs 可用，但 `title-text.ts` 只向后传纯文本和 bbox | 丢失源样式与可移动公式对象；需要保留结构化内容到翻译、重排与导出 |
| 版面 | `midend/layout_parser.py`：布局模型及字符归属 | PP-DocLayoutV3 / Paddle / MinerU，按 run 中心入框 | 模型与粒度不同；同一 PDF 不保证相同段落 |
| 段落 | `midend/paragraph_finder.py`：layout/XObject 分组，视觉 Y 聚类，碰撞直方图分行，列表/目录/可选短行切段，重叠修复 | 阅读行排序 + 行距切段；小写续句启发式跨页/栏串接 | 初始缺少列表边界、缩进、XObject 与字符级聚类；不能用跨页拼接冒充同算法 |
| 公式 | `midend/styles_and_formulas.py`、`utils/formular_helper.py`：字体、Unicode 类别、布局、角标尺寸、visual bbox；合并公式、绑定曲线/Form | `translate/mask.ts`：TeX/URL/引用字符串占位 | 普通 PDF 没有 TeX；分数线、上下标、数学字体不能从纯文本恢复 |
| 样式 | `StylesAndFormulas._calculate_base_style`、`process_page_styles`：基准样式与同样式片段，字号众数 | 从框面积、字符长度估字号，标题统一加粗 | 不知道真实字号，段内粗斜体和颜色丢失 |
| 翻译单位 | `il_translator.py` / `il_translator_llm_only.py`：段落组成、公式与富文本占位、上下文和术语 | 句级编号批次，跨框句对映射；可靠性包装额外重试失败项 | 上游 LLM 路径还把相邻页末/页首正文配对、按 Y 跳变 >20 pt 配对跨栏段落；与本项目小写续句串接不同。同模型也不会逐字一致 |
| 输入完整性 | IL 保存完整段落；翻译失败有回退策略 | 底层 `source` 截至 2500 字符，`raw` 保留全文；实际 UI 经可靠性包装已保存全文并拆分 2200 字符块 | 两套提取器不一致；包装层把分块伪装成 header，raw 变为归一化 source，损失原句定位；需统一完整文本和传输层分块 |
| 输出校验 | 占位符解析回填结构化组成；失败按上游路径重试/回退 | 只检查占位符是否出现，漏标后发无保护原文；多余编号被最后一段吸收 | 重复/未知占位符、损坏批次可能被当成功；应拒绝不完整结果 |
| 排版单元 | `midend/typesetting.py:TypesettingUnit`：字形/公式宽高、字体 advance、原对象 passthrough/relocate | DOM span 与浏览器字体、矩形白底 | 浏览器断行不能等同于上游字形排版，公式不能整体移动 |
| 缩放 | `_find_optimal_scale_and_layout`：CJK/其他初始行距不同，离散缩放，向下/右借空白，放松英文断行后重试 | 固定 1.25→1.10 行距、二分字号；仅标题/图题受限扩框 | 顺序、阈值、可用空间均不同；单改常数不构成等价 |
| 全文一致性 | `preprocess_document`：按字符数加权的缩放众数，限制较大段落缩放 | 每块独立估算，标题有本页正文参考值 | 逐批即时显示与整篇预计算有产品取舍；需稳定的文档级布局阶段 |
| 表格/扫描 | 可选 `table_parser.py`；`detect_scanned_file.py` 与配置相关 | 目前全文覆盖依赖文字层，表格内容不作为独立单元翻译 | 不能把“图表留在原位”算成“支持表格翻译”；扫描检测不等于 OCR 完成 |
| PDF 输出 | `backend/pdf_creater.py`：重建 PDF 字体/内容，mono/dual、链接等 | 原 PDF + HTML 覆盖层、JSON 缓存 | 没有等价的重排 PDF 输出；原文批注映射是本项目额外契约 |

## 实施顺序与未决项

1. 修复完整文本、传输预算与结果校验；保留源字号，消除已知的数据损失。
2. 建立含字符索引、字体、基线与公式原对象引用的中间表示；贯穿缓存、句对、覆盖层。
3. 在中间表示上实现公式识别、公式/图形整体移动、富文本占位和还原。
4. 建立可重复的字形度量/断行/碰撞/全文缩放计算；使显示与导出消费同一布局结果。
5. 实现 PDF 内容流输出与字体子集，验证原有超链接和批注语义。
6. 同文档、同目标语言、同模型参数比较中间结果与渲染，再逐项关闭差异。

## 对照实验规则

- 科研样本至少覆盖：双栏正文、密集行内公式、多行公式/算法、表格、混合字号。
- 分离确定性算法测试和真实 LLM 测试：固定译文用于排版比较，真实翻译用于占位与语义比较。
- 记录 PDF SHA-256、页码、引擎 commit、模型/参数、字体、页面尺寸与缩放。
- 比较：源字符覆盖率、公式/占位符数量、段落边界、框越界/碰撞、字号、链接与批注。
- 截图只能证明该样本视觉结果；不能证明算法等价。没有实际运行的链路明确标为未验证。
- 样本、上游检出、截图和临时运行环境均留在仓库外。

## 本次验证与残余差异

### 已实现的范围

- 统一公开可靠性入口与底层的文本提取：完整 `source`、原始 `raw`、段落类型与句子锚点一直保留。
  取消将长段落拆成伪 `header` 的中间结构，改为占位保护后按请求预算分块。
- 缺失、重复、未知占位符和多余批次编号不再视为成功；重试保持保护，最终失败保留原文。
- 从 PDF rich runs 采样按字符数加权的源字号众数及主要粗斜体，随布局缓存、翻译条目传到覆盖层。
  老缓存只补走文字层，不重跑版面模型。字号不再仅凭框面积与译文长度猜测。
- 这些是 Agentero 的独立实现。没有引入 Python 运行时，也没有完成 BabelDOC 的字符级 IL、公式对象重排或 PDF 输出。

### 实际样本与方法

| 论文 | 实际文件 | SHA-256 |
|---|---|---|
| [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | v7，15 页 | `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697` |
| [Deep Residual Learning for Image Recognition](https://arxiv.org/abs/1512.03385) | v1，12 页 | `1e0651b6810ecba34a3dbc5b5b0209226f889004607c1f203540a48d64e5a93a` |

版面链路使用真实 PDFium + PP-DocLayoutV3。视觉实验取两篇第 1 页：给两边注入**相同固定中文译文**，
Attention 替换标题、摘要标题、摘要正文 3 块；ResNet 替换标题、摘要标题、两段摘要 4 块。
其他文字保持英文。没有调用真实翻译模型；因此本实验验证提取、排版与渲染差异，不验证语义或端到端翻译质量。

BabelDOC 实际运行上述固定 commit 的 CLI，替换翻译阶段回调后继续使用其段落、样式、排版与 PDF 写出流程。
保留调试 IL 供读取字号/缩放，另跑无 debug、无水印输出用于截图。参考环境使用 bitstring 4.4、PyMuPDF 1.28.2、peewee 3.19；
最初直接安装解析到不兼容依赖，固定这些版本后成功。Agentero 使用实际 `LayoutTranslateOverlay`、同一 PDF 的底图与模型检测框，
在 Chrome 中以 816 × 1056 CSS px、DPR 2 渲染；页面为 612 × 792 pt。
“before”截图只关闭 `sourceStyle`，用于比较旧字号回退策略，**不是完整 checkout 基线的前后测试**。

桌面端已通过 `pnpm tauri dev` 编译启动并截屏。当前会话没有可用的 computer-use 交互工具，
上述组件流程由 Playwright 验证；未验证桌面内点击翻译按钮、真实 provider、跨页滚动及导出交互。

### 定量与视觉结果

下表 Agentero 为渲染后的 CSS 字号除以 4/3，统一换算成 pt；BabelDOC 为源字号乘排版 scale。

| 样本块 | 原字号回退策略 | 本次源字号策略 | BabelDOC |
|---|---:|---:|---:|
| Attention 标题 | 15.000 | 15.498 | 15.494 |
| Attention 摘要标题 | 13.321 | 11.960 | 11.955 |
| Attention 摘要正文 | 9.867 | 9.960 | 9.963 |
| ResNet 标题 | 14.605 | 14.350 | 14.346 |
| ResNet 摘要标题 | 12.896 | 11.960 | 11.955 |
| ResNet 第一段摘要 | 10.253 | 9.960 | 9.963 |
| ResNet 第二段摘要 | 10.197 | 9.960 | 9.963 |

7 个被替换块的 DOM `scrollWidth/Height` 均未超过 `clientWidth/Height`。这仅说明这些块没有滚动溢出，
不能证明没有邻块碰撞、公式遗漏或整篇无缺陷。

逐项仍可观察到：

1. **提取与排序**：ResNet PDFium runs 已将 `learn-` / `ing` 输出为 `learn` / `ing`，
   BabelDOC 段落仍含 `learn- ing`；`152 layers—8× deeper` 的乘号在 PDFium 提取顺序中跑到后方。
   这发生在翻译前，字符串后处理不足以可靠恢复。两种提取结果都需与页面字符位置核对，不能直接把某一结果当真值。
2. **字体与富文本**：ResNet 原摘要斜体。本次主要样式继承会令整段中文倾斜；BabelDOC 此样本中文使用直立字形、拉丁字母保留斜体。
   需要按字符/脚本选择真实字体与段内样式，单一 `fontStyle` 不等价。
3. **断行、缩进、行距**：字体度量、首行缩进与框边界仍不同。上游按字形/公式排版，CJK 初始行距因子 1.5，
   其他为 1.3，并同时考虑字符实际高度；当前 DOM 使用 1.25→1.10。即使最终字号相近，基线位置仍不同。
4. **缩放策略**：Attention 标题两边恰好都约缩至 90%，并不代表算法相同；当前仍为 DOM 二分适配，
   上游还会离散重试、借空白、调整英文断行、使用全文缩放统计。
5. **未覆盖功能**：公式与曲线整体移动、表格翻译、扫描件策略、术语/上下文、mono/dual PDF、字体子集与输出链接均未达到上游能力。
   公式密集页、多行公式、表格和真实翻译模型尚无配对验收结果。

### 验证记录与复现

- 最终 TypeScript 类型检查通过；全量单元测试 286 文件通过、1 文件跳过，2327 用例通过、5 跳过，
  包含公开入口长句与源样式缓存回归测试。
- `pnpm lint:ts` 通过，仓库其余位置仍有 7 warnings、1 info，未自动修改无关文件。
- Attention 全 15 页真实模型 smoke 通过。ResNet 全篇运行在第 8 页触发已有 `image.titleBbox` 断言，
  尚未与原始 checkout 配对定位，因此不能判断是否为既存缺陷；仅第 1 页定向运行通过。没有宣称全篇 smoke 通过。
- 没有 Rust 生产代码变更；桌面开发编译通过，未执行完整跨平台发布测试。

本机实验目录为 `/tmp/agentero-babeldoc-comparison`，包含两篇 PDF、检测 JSON、
`render-overlay.cjs` / `render-resnet.cjs`、`fixed-reference.py` / `fixed-resnet.py`、
调试 IL、`fixed-clean-output/` PDF、`*-before.png` / `*-after.png` / `*-babeldoc-clean.png` 与日志。
它是临时研究产物，可能被系统清理，不作为仓库依赖；截图和 PDF 未提交。

真实模型 smoke 复现（省略 `AGENTERO_LAYOUT_MAX_PAGES` 即全篇）：

```sh
AGENTERO_LAYOUT_PDF_DIR=/tmp/agentero-babeldoc-comparison \
AGENTERO_LAYOUT_MODEL=/path/to/pp-doclayoutv3.onnx \
AGENTERO_LAYOUT_PDFS=attention,resnet \
AGENTERO_LAYOUT_MAX_PAGES=1 \
pnpm exec vitest run test/pdf-layout-arxiv.test.ts
```

**验收状态：只完成第一阶段完整性与源样式修复；全文功能与核心算法等价未达成。**
后续的验收入口是上述中间表示、公式对象、统一排版及 PDF 输出四项，不能以这 7 块截图代替。
