---
name: designer-requirement-analysis-html
description: 将完整 PRD、需求文档、粘贴的需求原文或需求材料解析为面向设计师的交互式 HTML，固定包含需求解析、设计要点、同类功能竞品分析三个顶层 Tab，并输出业务泳道图、A-F 业务链路、页面流程、逐页面详情、跨页面设计约束、全局阻塞问题、全部页面设计要点与风险、术语统一及移动云对阿里云/华为云/腾讯云的竞品对比。用户要求“完整解析需求”“不能漏需求”“给设计师看”“生成需求分析 HTML”“设计评审要点”“页面流程图”或“三模块竞品分析”时使用。
---

# 设计师需求解析 HTML

把需求事实完整转译为可核对、可追溯、可交互的设计分析 HTML。先保证原文覆盖和事实边界，再追求视觉效果。

## 强制读取

开始工作前按任务需要读取：

- 始终读取 [source-specification.md](references/source-specification.md)，确认原始规范和不可遗漏项。
- 对规范完整性有疑问或需要逐字审计时，读取归档原件 `references/original-specification.docx`；该文件是本 Skill 的最终事实底稿。
- 生成第一模块时读取 [requirement-analysis-module.md](references/requirement-analysis-module.md)。
- 生成第二模块时读取 [design-review-module.md](references/design-review-module.md)。
- 生成第三模块时读取 [competitor-analysis-module.md](references/competitor-analysis-module.md)。
- 组装页面和数据文件时读取 [html-output-contract.md](references/html-output-contract.md)。
- 需要泳道图视觉参考时查看 `assets/example-swimlane.png`；只参考结构，不复制图中文字或业务事实。

## 不可违反的规则

1. 完整阅读全部输入，包括正文、表格、图片、批注、页眉页脚、附件和补充说明；不得只读摘要或前几页。
2. 先将每条原文编号为 `R001`、`R002`……，保留原意、限定词、例外、数字、状态和来源位置。
3. 原文是唯一业务事实主锚点。`knowleddge` 风险库和 `fallback-kb` 兜底知识库只能补漏或提出建议，不能改写成既有产品规则。
4. 原文未定义但设计不可缺少的模块可以提出，但必须标为“设计必需补充/待确认”，并在页面 Tab、数据和视觉样式上与原文页面区分。
5. 不得因页面、字段、流程或风险已经在另一模块出现而漏掉该模块的强制内容。第二模块的“全部页面设计要点与设计风险”必须再次完整汇总。
6. 不得用图片生成模型直接画业务流程图。先输出结构化 JSON，再由前端渲染；不确定跳转写入 `unknownEdges`。
7. 不得伪造知识库命中、竞品事实、来源 URL、访问日期、产品现状或页面状态。检索失败时明确标注 `未检索/访问受阻/仅需求推导`。

## 执行流程

### 1. 建立原文索引与覆盖账本

- 解析所有输入材料，按原始顺序生成 `requirement_source_indexed.md`。
- 每条原文赋予唯一 `Rxxx`，不得合并掉条件、例外或否定表述。
- 建立 `coverage-ledger.json`，记录每条 `Rxxx` 被哪些模块、页面和设计结论覆盖。
- 抽取页面、功能、角色、入口、按钮、字段、规则、状态、流程、结果、异常、权限和待确认项。
- 对图片或图表中的有效文字和关系单独建条目；无法确认时标注不确定，不猜测。

### 2. 获取辅助知识

- 尝试检索风险知识库 `knowleddge` 和 IP 兜底知识库 `fallback-kb`。
- 记录检索词、条目 ID、命中内容和使用位置。
- 将命中内容标为“风险库建议”或“兜底建议”；不得覆盖需求事实。
- 若环境支持 `$product-prototype`，用它辅助抽取业务泳道、页面架构、页面流和竞品功能表现；仍以本 Skill 的覆盖账本和输出约束为准。

### 3. 生成第一模块：需求解析

严格执行 [requirement-analysis-module.md](references/requirement-analysis-module.md)：

- 需求总览卡片：概述、目标用户、使用场景、页面数量。
- 业务流程：泳道图和 A-F 层分解。
- 页面总览：页面流程图、页面层级、页面模块和跳转关系。
- 页面详情：每个页面一个子 Tab，完整呈现前置条件、待确认项、配置字段、交互规则、操作流程、结果反馈、页面设计要点和设计风险。
- 为设计必需但原文未定义的页面或模块使用独立标识，不与事实内容混淆。

### 4. 生成第二模块：设计要点

严格执行 [design-review-module.md](references/design-review-module.md)：

- 输出跨页面设计约束，最多 6 条，只保留影响至少两个页面或多个操作的规则。
- 输出必须确认的全局问题，最多 5 条，只保留不确认就无法定稿的决策。
- 按上游页面顺序完整汇总每个页面的全部设计要点、设计风险和保护建议，不限制 P0/P1，不得漏页。
- 在完整收录上游内容后，再补充有明确设计影响的风险。
- 仅统一界面可见且确实不一致的术语。

### 5. 生成第三模块：同类功能竞品分析

严格执行 [competitor-analysis-module.md](references/competitor-analysis-module.md)：

- 本品固定为移动云；竞品固定覆盖阿里云、华为云、腾讯云。
- 以需求中出现的同类功能为分析单位，比较入口、页面结构、字段与校验、流程、状态反馈、关联资源和风险保护。
- 所有竞品事实附来源 URL、访问日期和证据状态；无法访问时保留阻塞说明，禁止凭记忆补齐。
- 区分“需求事实”“竞品事实”“设计启示”，不把竞品做法直接升级为本品需求。

### 6. 组装 HTML 与数据包

执行 [html-output-contract.md](references/html-output-contract.md)：

- 顶部固定三个 Tab：`需求解析`、`设计要点`、`竞品分析`。
- 使用 `page_flow_schema.json` 驱动泳道/页面流程图；优先 React Flow + ELK.js，简单场景可用 Dagre，保持可缩放、可拖拽、节点可点击、可导出 PNG/SVG。
- 点击图中页面节点时，定位到第一模块对应页面详情 Tab。
- 生成 `analysis-data.json`、`page_flow_schema.json`、`coverage-ledger.json` 和最终 HTML。
- 默认交付自包含 HTML；若使用外部资源，提供可离线工作的降级方案。

### 7. 校验与视觉复核

运行：

```powershell
python scripts/validate_analysis_bundle.py --data analysis-data.json --html requirement-analysis.html
```

校验失败时不得交付。修复直至满足：

- 所有 `Rxxx` 均在覆盖账本中有状态。
- 页面清单、流程图页面、页面详情和第二模块页面分组一致。
- 每个已解析页面都有设计要点/风险分组；没有内容时明确写“上游未总结相关内容”。
- 三个云竞品均存在，并具有证据状态。
- 三个顶层 Tab、未知跳转、来源标记和设计补充标记均可识别。

最后在真实浏览器中检查所有 Tab、滚动定位、图节点、长表格、窄屏适配、空状态和导出能力；修复溢出、遮挡、错误跳转和不可读文本。

## 最终交付

至少交付：

- `requirement-analysis.html`
- `analysis-data.json`
- `page_flow_schema.json`
- `coverage-ledger.json`
- `requirement_source_indexed.md`

简要报告输入材料、原文条目数、页面数、覆盖率、知识库检索状态、竞品证据状态和仍需确认的问题。不要把未解决问题描述为已完成。
