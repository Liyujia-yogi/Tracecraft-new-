# TRACECRAFT 证据清单与主张矩阵

## 证据等级

- A：运行数据、代码、测试结果可直接核验
- B：界面或文档明确呈现，且与实现相互印证
- C：基于现有证据的合理设计解读，不作为量化事实
- U：未知或缺失，必须待补充

| 编号 | 可主张事实 | 证据来源 | 等级 | 边界说明 |
|---|---|---|---|---|
| E01 | 项目定位为需求解析与设计评审平台 | `README.md`、`src/App.vue`、`src/views/DashboardView.vue` | B | 属于产品自述，已由实际页面印证 |
| E02 | 核心链路覆盖需求、解析、评审、反馈优化 | `tracecraft-platform-workflow.archify.json`、前后端路由 | A | 竞品与线稿为可选分支 |
| E03 | 存在管理员与普通用户角色 | `.data/db.json` 用户数量、`server/index.mjs` 鉴权中间件、`src/types.ts` | A | 不披露密码与密钥 |
| E04 | 管理员可查看全部评审和发起优化 | `src/views/AnalyticsView.vue`、`src/views/FeedbackView.vue`、服务端 requireAdmin | A | 正式组织权限体系尚未建立 |
| E05 | 当前数据库含 11 条需求 | `.data/db.json` 聚合结果 | A | 本地记录，不是生产规模 |
| E06 | 含 12 个解析版本、9 个设计稿版本、11 轮评审 | `.data/db.json` 聚合结果 | A | 不同版本可能来自迭代和测试 |
| E07 | 共 213 条评审意见；10 轮完成、1 轮部分完成 | `.data/db.json` 聚合结果 | A | 部分完成记录保留失败页面 |
| E08 | 3 轮已保存评审含 83 条意见，52 条待处理 | `.data/db.json`、评审统计页面 | A | 仅已保存评审进入统计 |
| E09 | 31 条意见已处置：采纳 19、部分采纳 3、不采纳 9 | `.data/feedback/design-review-feedback.jsonl` | A | 处置集中于“带宽”产品样本 |
| E10 | 综合采纳率 71.0%，完全采纳率 61.3% | `server/index.mjs` 统计公式、评审数据页面 | A | 待处理/待定不计入分母；不能外推为模型总体准确率 |
| E11 | 12 个解析版本均有 runId，10 个 validation.ok=true | `.data/db.json` | A | 2 个旧/未通过结果仍作为历史存在 |
| E12 | analysis-runs 中存在原文索引、分析数据、流程、覆盖账本和 HTML | `.data/analysis-runs/**` | A | 不把产物存在等同于所有内容完全正确 |
| E13 | 评审绑定需求证据模式、解析版本、设计版本和 Skill | `src/types.ts`、`.data/db.json` review 结构 | A | 竞品版本在当前主数据中为 0 |
| E14 | 部分采纳/不采纳必须填写理由；已保存评审不可修改 | `server/index.mjs` API 校验、`IssueEditor.vue` | A | 属于系统约束 |
| E15 | 已解析与未解析需求采用双评审路径 | `server/index.mjs`、`design-review-pipeline.mjs` | A | 未解析路径使用 validate-user-experience |
| E16 | 解析进度拆分为六阶段 | `RequirementWorkspace.vue`、`requirement-analysis-pipeline.mjs` | A | 阶段百分比为产品定义权重 |
| E17 | 代表性解析：204 条原文、9 页、15 个业务节点、8 条连线、0 未映射 | 当前 IP 1.2 解析版本及界面截图 | A | 单个代表性版本，不代表平均水平 |
| E18 | 当前 IP 1.2 解析形成 48 个待确认问题 | `.data/db.json`、待确认项页面 | A | 数量与需求复杂度相关，不代表质量越高越好 |
| E19 | 实际评审可识别业务缺失、术语不一致、恢复不足等问题 | `.data/db.json` review issues、评审页面 | A | 具体意见仍需人工判断 |
| E20 | 页面视图支持问题与设计标注联动 | `ReviewPageView.vue`、设计评审截图 | A | 部分低置信标注需复核 |
| E21 | 统计仅采用已保存评审，公式在 UI 明示 | `server/index.mjs`、`AnalyticsView.vue` | A | 小样本仍需额外提示 |
| E22 | 优化器只生成候选报告，不直接修改生产 Skill | `FeedbackView.vue`、优化 API、README | A | 当前仅有 1 条样本数为 0 的需求候选报告 |
| E23 | 正式解析需通过五件套产物和完整度门禁 | `requirement-analysis-pipeline.mjs`、`local-skill-runner.mjs` | A | 存储版本中仍保留旧失败结果 |
| E24 | 评审按页面执行，支持部分失败保留和失败页重试 | `design-review-pipeline.mjs`、review pipeline smoke test | A | 并发值可配置 |
| E25 | API Key 位于本地服务端目录，正式部署需专业密钥管理 | README、`SettingsView.vue` | B | 未读取或披露 `.data/secrets.json` |
| E26 | 类型检查、构建及 8 类专项 smoke test 通过 | 本次命令输出 | A | 构建仍有包体积警告 |
| E27 | 桌面与移动视觉检查共 12 张截图，consoleErrors=[] | `npm run visual-check` 输出 | A | 不是正式可用性测试 |
| U01 | 申报单位、作者、项目周期、参评类别 | 未提供 | U | 正文保留待补充标记 |
| U02 | 用户访谈、可用性测试、满意度、NPS | 项目未提供 | U | 不得虚构 |
| U03 | 工时节省、返工减少、上线缺陷下降 | 项目未提供对照数据 | U | 只能作为未来验证指标 |
| U04 | 生产部署、组织用户规模、SLA 与安全合规 | 项目未提供 | U | 当前仅定位本地 MVP |

## 不可主张内容

1. 不可声称已实现组织级规模化上线。
2. 不可把 71% 采纳率解释为模型准确率或全产品平均值。
3. 不可声称已显著缩短设计周期，除非补充基线与对照数据。
4. 不可声称候选优化已经发布为生产 Skill 新版本。
5. 不可声称竞品材料功能已有真实业务使用记录；当前主数据库竞品版本为 0。

