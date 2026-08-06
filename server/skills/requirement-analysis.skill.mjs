export const requirementAnalysisSkill = {
  id: 'requirement-analysis',
  version: 'designer-requirement-analysis-html',
  orchestratorSkill: 'designer-requirement-analysis-html',
  execution: 'model-api',
  qualityGates: [
    '完整读取原始文档、表格、图片和嵌入附件',
    'analysis-data、页面流、覆盖账本与 HTML 内嵌数据一致',
    '业务泳道采用阶段×参与方二维网格与正交连线',
    '页面详情使用上下文、核心规格、结果与设计核对三个整合区块',
    '新版固定 UI 基线和 DOM 标识校验通过',
  ],
}
