import fs from 'node:fs'

let prompt = ''
for await (const chunk of process.stdin) prompt += chunk.toString('utf8')
if (!prompt.includes('$designer-requirement-analysis-html')
  || !prompt.includes('不能调用旧的 $analyze-requirements-for-designers')
  || !prompt.includes('阶段×参与方二维网格')
  || !prompt.includes('page-detail-context')
  || !prompt.includes('禁止使用 PowerShell here-string')
  || !prompt.includes('禁止再调用 HTML 转义函数')) {
  console.error('updated designer skill instruction missing')
  process.exit(2)
}

const target = (label) => prompt.match(new RegExp(`${label}：([^\\r\\n]+)`))?.[1]?.trim()
const output = target('最终 HTML 必须写入')
const sourceIndexedPath = target('编号原文必须写入')
const requirementJsonPath = target('需求解析 JSON 必须写入')
const designJsonPath = target('设计要点 JSON 必须写入')
const competitorJsonPath = target('竞品分析 JSON 必须写入')
const analysisDataPath = target('analysis-data.json 必须写入')
const pageFlowSchemaPath = target('page_flow_schema.json 必须写入')
const coverageLedgerPath = target('coverage-ledger.json 必须写入')
if (!output || !analysisDataPath || !pageFlowSchemaPath || !coverageLedgerPath || !process.env.DIP_PIPELINE_FIXTURE_HTML) process.exit(3)

const delay = Number(process.env.DIP_FAKE_CODEX_DELAY_MS || 0)
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const page = {
  id: 'flow-log-page', name: '流日志分析页', origin: 'source_fact', module: 'VPC / 流日志', path: 'VPC 控制台 > 流日志', pageType: '管理页',
  preconditions: [], openQuestions: [], fields: [], interactionRules: [], steps: [],
  feedback: { success: [], failure: [], async: [], partial: [] }, designPoints: [], designRisks: [], sources: ['R001'],
}
const pageFlow = {
  lanes: [{ id: 'level1', title: '一级页面' }],
  pages: [{ id: page.id, lane: 'level1', title: page.name, modules: ['创建与查看'], origin: 'source_fact', sources: ['R001'] }],
  edges: [], unknownEdges: [], coverage: [{ sourceId: 'R001', objectType: 'page', objectId: page.id, status: 'covered' }],
}
const coverage = [{ sourceId: 'R001', locations: ['pages[0]'], status: 'covered' }]
const data = {
  meta: { title: 'VPC 流日志设计师需求解析', generatedAt: new Date().toISOString(), sourceFiles: ['source.md'] },
  requirements: [{ id: 'R001', text: '完整需求材料', source: 'source.md#1' }],
  overview: { summary: '完整解析流日志需求', targetUsers: [], scenarios: [], pageCount: 1, globalBlockers: [], sources: ['R001'] },
  businessFlow: { swimlane: {
    title: '流日志业务流程', subtitle: '阶段与参与方',
    phases: [{ id: 'operate', title: '操作', order: 1 }],
    lanes: [{ id: 'user', title: '用户', kind: 'actor', order: 1 }],
    nodes: [{ id: 'open-page', lane: 'user', phase: 'operate', title: '管理流日志', subtitle: '进入流日志分析页', pageId: page.id, systemAction: false, origin: 'source_fact', sources: ['R001'] }],
    edges: [], unknownEdges: [],
  } },
  afLayers: ['A 上游数据层', 'B 管控规则层', 'C 业务规则层', 'D 申请/发起层', 'E 校验/审核层', 'F 执行/输出层'].map((layer) => ({ layer, responsibility: '覆盖需求', keyFunctions: ['解析'], dataSources: ['需求原文'], sources: ['R001'] })),
  pageFlow,
  pages: [page],
  designReview: { crossPageConstraints: [], pages: [{ pageId: page.id, items: [] }], terminology: [] },
  competitors: {
    products: ['移动云', '阿里云', '华为云', '腾讯云'],
    features: [{ name: '流日志分析', pages: [page.id], sources: ['R001'] }],
    evidence: ['移动云', '阿里云', '华为云', '腾讯云'].map((product) => ({ product, feature: '流日志分析', status: 'not-found', accessedAt: '2026-07-27' })),
  },
  knowledgeRetrieval: { knowleddge: { status: 'not-run', items: [] }, 'fallback-kb': { status: 'not-run', items: [] } },
  coverage,
}

fs.writeFileSync(sourceIndexedPath, '# R001\n完整需求材料', 'utf8')
if (delay) await wait(delay)
fs.writeFileSync(requirementJsonPath, JSON.stringify({ overview: data.overview, businessFlow: data.businessFlow, afLayers: data.afLayers, pageFlow, pages: data.pages, coverage }, null, 2), 'utf8')
if (delay) await wait(delay)
fs.writeFileSync(designJsonPath, JSON.stringify({ designReview: data.designReview }, null, 2), 'utf8')
if (delay) await wait(delay)
fs.writeFileSync(competitorJsonPath, JSON.stringify({ competitors: data.competitors }, null, 2), 'utf8')
fs.writeFileSync(analysisDataPath, JSON.stringify(data, null, 2), 'utf8')
fs.writeFileSync(pageFlowSchemaPath, JSON.stringify(pageFlow, null, 2), 'utf8')
fs.writeFileSync(coverageLedgerPath, JSON.stringify(coverage, null, 2), 'utf8')
if (delay) await wait(delay)

let html = fs.readFileSync(process.env.DIP_PIPELINE_FIXTURE_HTML, 'utf8')
const payload = JSON.stringify(data).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
html = html.replace(/(<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>)([\s\S]*?)(<\/script>)/i, `$1${payload}$3`)
html = html.replace('</head>', '<style>:root{--canvas:#f4f6fa;--ink:#172033;--muted:#667085;--brand:#4657c8;--line:#d9dfeb;font-family:Inter,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}</style></head>')
html = html.replace('</body>', '<div id="overview-global-blockers"></div><div id="business-swimlane"></div><div id="page-detail-context"></div><div id="page-detail-core"></div><div id="page-detail-outcome-review"></div></body>')
fs.writeFileSync(output, html, 'utf8')

const messageIndex = process.argv.indexOf('--output-last-message')
if (messageIndex >= 0 && process.argv[messageIndex + 1]) fs.writeFileSync(process.argv[messageIndex + 1], 'fixture complete', 'utf8')
console.log('fixture complete')
