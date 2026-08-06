# HTML 与数据包输出契约

## 目录

1. 交付文件
2. 页面信息架构
3. 交互与视觉要求
4. `analysis-data.json` 最小结构
5. 覆盖和来源规则
6. 浏览器验收

## 1. 交付文件

```text
requirement-analysis.html
analysis-data.json
page_flow_schema.json
coverage-ledger.json
requirement_source_indexed.md
```

HTML 可内嵌数据，但仍保留独立 JSON 以便校验和二次编辑。默认生成自包含 HTML；必须使用外部库时，提供加载失败的静态降级视图。

## 2. 页面信息架构

页面顶部固定三个顶层 Tab，顺序和标识不得变化：

1. `需求解析`，DOM 标识 `tab-requirement-analysis`。
2. `设计要点`，DOM 标识 `tab-design-review`。
3. `竞品分析`，DOM 标识 `tab-competitor-analysis`。

### 2.1 需求解析

- 需求总览卡片。
- 业务流程：泳道图、A-F 层分解。
- 页面总览：页面流程图和覆盖状态。
- 页面详情子 Tab：每个页面一个；`design_required` 页面使用不同标签、边框或底色。

### 2.2 设计要点

- 跨页面设计约束。
- 必须确认的全局问题。
- 全部页面的设计要点与设计风险。
- 术语统一。

### 2.3 竞品分析

- 功能范围。
- 移动云、阿里云、华为云、腾讯云总体对比。
- 分功能证据卡。
- 设计启示。
- 证据和阻塞清单。

## 3. 交互与视觉要求

- 点击顶层 Tab 切换模块，并保持浏览位置或提供返回顶部。
- 点击页面流节点，激活对应页面详情子 Tab 并滚动到页面内容。
- 页面流支持缩放、拖拽和导出 PNG/SVG；不能依赖图片生成模型。
- 页面流推荐 React Flow + ELK.js，简单场景允许 Dagre。
- `source_fact`、`design_inference`、`risk_kb`、`fallback_kb` 使用一致且可辨识的来源标记。
- `unknownEdges` 使用虚线和待确认提示。
- 长表格具有粘性表头或横向滚动；来源列可展开。
- 小屏下卡片和表格可读，不截断关键信息。
- 空章节不渲染；受阻或无证据状态必须渲染为空状态，不能隐藏。
- 使用明确层级、克制配色和可打印样式；设计服务于快速核对，不做装饰性堆叠。

## 4. `analysis-data.json` 最小结构

```json
{
  "meta": {
    "title": "产品/功能名称",
    "generatedAt": "2026-07-23T00:00:00Z",
    "sourceFiles": ["prd.docx"]
  },
  "requirements": [
    {"id": "R001", "text": "需求原文", "source": "prd.docx#位置"}
  ],
  "overview": {
    "summary": "",
    "targetUsers": [],
    "scenarios": [],
    "pageCount": 0,
    "sources": []
  },
  "afLayers": [
    {
      "layer": "A 上游数据层",
      "responsibility": "",
      "keyFunctions": [],
      "dataSources": [],
      "sources": []
    }
  ],
  "pages": [
    {
      "id": "page-id",
      "name": "页面名称",
      "origin": "source_fact",
      "module": "",
      "path": "",
      "pageType": "",
      "preconditions": [],
      "openQuestions": [],
      "fields": [],
      "interactionRules": [],
      "steps": [],
      "feedback": {"success": [], "failure": [], "async": [], "partial": []},
      "designPoints": [],
      "designRisks": [],
      "sources": []
    }
  ],
  "designReview": {
    "crossPageConstraints": [],
    "globalBlockers": [],
    "pages": [
      {"pageId": "page-id", "items": []}
    ],
    "terminology": []
  },
  "competitors": {
    "products": ["移动云", "阿里云", "华为云", "腾讯云"],
    "features": [],
    "evidence": []
  },
  "knowledgeRetrieval": {
    "knowleddge": {"status": "not-run", "items": []},
    "fallback-kb": {"status": "not-run", "items": []}
  },
  "coverage": [
    {"sourceId": "R001", "locations": ["overview.summary"], "status": "covered"}
  ]
}
```

允许扩展字段，但不得删除最小结构。`pages.origin` 取值为 `source_fact` 或 `design_required`。

## 5. 覆盖和来源规则

- `requirements[].id` 必须唯一且符合 `R\d{3,}`。
- 每个需求条目在 `coverage` 中恰有一个最终状态：`covered`、`uncertain` 或 `missing`。
- 交付前 `missing` 必须为 0；`uncertain` 必须能定位到待确认项。
- `pages`、`page_flow_schema.pages` 和 `designReview.pages` 的页面 ID 集合必须一致。
- 页面流中的所有 `edges` 端点必须存在；未知目标进入 `unknownEdges`。
- 每条设计结论带需求来源或知识库来源。
- 知识库来源写明知识库名和条目 ID；检索未运行时不得出现伪造条目。
- 竞品事实带产品、URL、访问日期和证据状态。

## 6. 浏览器验收

逐项检查：

- 三个顶层 Tab 均可切换，键盘可访问。
- 页面详情 Tab 数与页面数一致。
- 流程图节点能定位正确页面，未知边可见。
- 所有表格、长文本、来源标记和空状态可读。
- 页面无重叠、裁切、横向溢出或不可点击区域。
- 浏览器控制台无致命错误。
- 外部库加载失败时仍能看到完整静态内容。
- 打印或导出时不丢失关键内容。
- 运行 `scripts/validate_analysis_bundle.py` 并通过全部硬性检查。
