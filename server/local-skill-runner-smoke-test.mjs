import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalSkillWithDeepSeek } from './local-skill-runner.mjs'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-skill-runner-'))
const uploadDir = path.join(dataDir, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

const layers = ['A 上游数据层', 'B 管控规则层', 'C 业务规则层', 'D 申请/发起层', 'E 校验/审核层', 'F 执行/输出层']
const analysis = {
  meta: { title: '批量变更' },
  overview: { summary: '支持批量变更资源', targetUsers: ['客户'], scenarios: ['控制台批量操作'], globalBlockers: [] },
  businessFlow: { swimlane: { phases: [{ id: 'select', title: '选择', order: 1 }], lanes: [{ id: 'customer', title: '客户', kind: 'actor', order: 1 }], nodes: [{ id: 'n1', lane: 'customer', phase: 'select', title: '选择资源', pageId: 'list', sources: ['R001'] }], edges: [], unknownEdges: [] } },
  afLayers: layers.map((layer) => ({ layer, responsibility: '承载批量变更链路', keyFunctions: ['处理批量变更'], dataSources: ['需求原文'], sources: ['R001'] })),
  pages: [{ id: 'list', name: '资源列表页', origin: 'source_fact', module: '资源管理', path: '控制台', pageType: '列表页', preconditions: [], openQuestions: [], fields: [{ name: '资源', type: '复选框', required: '是', defaultValue: '未选中', description: '选择资源', constraints: '同类型', sources: ['R001'] }], interactionRules: ['选择后可批量变更'], steps: ['选择资源', '提交变更'], feedback: { success: '提示成功', failure: '提示失败', async: '显示处理中', partial: '展示明细' }, designPoints: ['明确选择数量'], designRisks: ['避免误选'], sources: ['R001'] }],
  pageFlow: { lanes: [{ id: 'level1', title: '一级页面' }], pages: [{ id: 'list', lane: 'level1', title: '资源列表页', modules: ['批量变更'], sources: ['R001'] }], edges: [], unknownEdges: [], coverage: [] },
  designReview: { crossPageConstraints: [], pages: [{ pageId: 'list', items: [{ type: 'design_point', fact: '明确选择数量', impact: '帮助确认范围', advice: '展示数量', priority: 'P1', sources: ['R001'] }] }], terminology: [{ different: '资源 vs 实例', unified: '统一为“资源”', position: '资源列表页', sources: ['R001'] }], globalBlockers: [] },
  competitors: { products: ['移动云', '阿里云', '华为云', '腾讯云'], features: [{ name: '批量变更', matrix: [] }], evidence: [] },
  coverage: [],
}

const prerequisiteCalls = [
  { id: 'chunk-0', type: 'function', function: { name: 'read_document_chunk', arguments: JSON.stringify({ index: 0 }) } },
  ...['source-specification.md', 'requirement-analysis-module.md', 'design-review-module.md', 'competitor-analysis-module.md', 'html-output-contract.md'].map((name, index) => ({ id: `resource-${index}`, type: 'function', function: { name: 'read_skill_resource', arguments: JSON.stringify({ relativePath: `references/${name}` }) } })),
  { id: 'evidence-1', type: 'function', function: { name: 'search_official_docs', arguments: JSON.stringify({ features: ['批量变更'] }) } },
]

let calls = 0
const fetcher = async () => {
  calls += 1
  const message = calls === 1
    ? { role: 'assistant', content: '', tool_calls: prerequisiteCalls }
    : calls === 2
    ? { role: 'assistant', content: '', tool_calls: [
      { id: 'write-1', type: 'function', function: { name: 'write_artifact', arguments: JSON.stringify({ artifact: 'analysis-data.json', content: JSON.stringify(analysis) }) } },
      { id: 'flat-flow-1', type: 'function', function: { name: 'set_analysis_section', arguments: JSON.stringify({ section: 'businessFlow', content: JSON.stringify(analysis.businessFlow.swimlane) }) } },
    ] }
    : { role: 'assistant', content: '', tool_calls: [{ id: 'validate-1', type: 'function', function: { name: 'validate_bundle', arguments: '{}' } }] }
  return { ok: true, json: async () => ({ choices: [{ message }] }) }
}

const evidenceCollector = async (features) => features.flatMap((feature) => [
  { product: '阿里云', feature: feature.name, url: 'https://help.aliyun.com/example', title: '文档', excerpt: '批量变更', accessedAt: '2026-07-28', evidenceStatus: 'verified' },
  { product: '华为云', feature: feature.name, url: 'https://support.huaweicloud.com/example', title: '文档', excerpt: '批量变更', accessedAt: '2026-07-28', evidenceStatus: 'verified' },
  { product: '腾讯云', feature: feature.name, url: 'https://cloud.tencent.com/document/example', title: '文档', excerpt: '批量变更', accessedAt: '2026-07-28', evidenceStatus: 'verified' },
])

try {
  const result = await runLocalSkillWithDeepSeek({
    requirement: { id: 'req_smoke', productName: '公网 IP', version: '1.0', summary: '批量变更', source: { filename: 'requirement.md', text: '支持客户批量选择资源并提交变更。' } },
    dataDir,
    uploadDir,
    skillDir: path.join(serverDir, 'local-skills', 'designer-requirement-analysis-html'),
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    apiKey: 'test-key',
    fetcher,
    evidenceCollector,
  })
  assert.equal(result.pipelineMode, 'deepseek-skill-runner')
  assert.equal(result.validation.ok, true)
  assert.equal(result.analysisData.pages.length, 1)
  assert.deepEqual(result.analysisData.designReview.terminology[0], { different: '资源 vs 实例', unified: '统一为“资源”', position: '资源列表页', sources: ['R001'], term: '资源 vs 实例', definition: '统一为“资源”', inconsistencies: '资源列表页' })
  assert.match(result.html, /资源 vs 实例/)
  const runDir = path.dirname(path.join(dataDir, result.artifactPath))
  for (const file of ['requirement-analysis.html', 'analysis-data.json', 'page_flow_schema.json', 'coverage-ledger.json', 'requirement_source_indexed.md']) assert.equal(fs.existsSync(path.join(runDir, file)), true, `${file} should exist`)

  let stalledCalls = 0
  let sawNoProgressInstruction = false
  let sawOverwriteRejection = false
  const stalledFetcher = async (_url, options) => {
    stalledCalls += 1
    const messages = JSON.parse(options.body).messages
    sawNoProgressInstruction ||= messages.some((message) => /校验错误没有变化|禁止再次直接校验/.test(String(message.content)))
    sawOverwriteRejection ||= messages.some((message) => /拒绝覆盖：新产物会丢失/.test(String(message.content)))
    const message = stalledCalls === 1
      ? { role: 'assistant', content: '', tool_calls: prerequisiteCalls.map((call) => ({ ...call, id: `stalled-${call.id}` })) }
      : stalledCalls <= 3
        ? { role: 'assistant', content: '', tool_calls: [{ id: `empty-validate-${stalledCalls}`, type: 'function', function: { name: 'validate_bundle', arguments: '{}' } }] }
        : stalledCalls === 4
          ? { role: 'assistant', content: '', tool_calls: [{ id: 'recovery-write', type: 'function', function: { name: 'write_artifact', arguments: JSON.stringify({ artifact: 'analysis-data.json', content: JSON.stringify(analysis) }) } }] }
          : stalledCalls === 5
            ? { role: 'assistant', content: '', tool_calls: [{ id: 'destructive-write', type: 'function', function: { name: 'write_artifact', arguments: JSON.stringify({ artifact: 'analysis-data.json', content: JSON.stringify({ meta: { title: '空骨架' }, pages: [] }) }) } }] }
            : { role: 'assistant', content: '', tool_calls: [{ id: 'recovery-validate', type: 'function', function: { name: 'validate_bundle', arguments: '{}' } }] }
    return { ok: true, json: async () => ({ choices: [{ message }] }) }
  }
  const recovered = await runLocalSkillWithDeepSeek({
    requirement: { id: 'req_stalled', productName: '公网 IP', version: '1.0', summary: '批量变更', source: { filename: 'requirement.md', text: '支持客户批量选择资源并提交变更。' } },
    dataDir,
    uploadDir,
    skillDir: path.join(serverDir, 'local-skills', 'designer-requirement-analysis-html'),
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-test',
    apiKey: 'test-key',
    fetcher: stalledFetcher,
    evidenceCollector,
  })
  assert.equal(recovered.validation.ok, true)
  assert.equal(sawNoProgressInstruction, true)
  assert.equal(sawOverwriteRejection, true)
  const recoveredRunDir = path.dirname(path.join(dataDir, recovered.artifactPath))
  const events = fs.readFileSync(path.join(recoveredRunDir, 'runner-events.jsonl'), 'utf8')
  assert.match(events, /runner_instruction/)
  console.log('local-skill-runner-smoke: ok')
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true })
}
