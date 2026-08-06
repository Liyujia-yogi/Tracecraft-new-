import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { extractAnalysisData, normalizeAnalysisDataHtml, runRequirementAnalysisPipeline, validateFormalAnalysisHtml } from './requirement-analysis-pipeline.mjs'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(serverDir, '..')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-pipeline-'))
const uploadDir = path.join(dataDir, 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })
fs.writeFileSync(path.join(uploadDir, 'source.md'), '# 流日志\n完整需求材料', 'utf8')
process.env.DIP_CODEX_SCRIPT = path.join(serverDir, 'test-fixtures', 'fake-codex-entry.mjs')
process.env.DIP_PIPELINE_FIXTURE_HTML = path.resolve(rootDir, '..', 'vpc-flow-log-analysis', 'requirement-analysis.html')
process.env.DIP_FAKE_CODEX_DELAY_MS = '950'

try {
  const progressEvents = []
  const result = await runRequirementAnalysisPipeline({
    projectRoot: rootDir,
    dataDir,
    uploadDir,
    requirement: {
      id: 'req_pipeline_smoke',
      productName: 'VPC',
      version: '1.0',
      summary: '流日志',
      source: { savedPath: 'source.md', text: '# 流日志\n完整需求材料' },
    },
    onProgress: (progress) => progressEvents.push({ percent: progress.percent, title: progress.title }),
  })
  const fixtureHtml = fs.readFileSync(process.env.DIP_PIPELINE_FIXTURE_HTML, 'utf8')
  const chineseSource = '# 中文需求\n用户需要配置网络资源、查看任务状态并处理异常结果。'.repeat(10)
  assert.throws(
    () => validateFormalAnalysisHtml(fixtureHtml, chineseSource, { requireDesignerContract: true }),
    /新版 Skill|阶段×参与方|origin/,
  )
  const corruptedHtml = fixtureHtml.replace(
    /(<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (_, opening, data, closing) => `${opening}${data.replace(/[\u3400-\u4dbf\u4e00-\u9fff]/g, '?')}${closing}`,
  )
  assert.throws(
    () => validateFormalAnalysisHtml(corruptedHtml, chineseSource),
    /编码损坏|中文内容异常缺失/,
  )
  const entityEscapedHtml = fixtureHtml.replace(
    /(<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>)([\s\S]*?)(<\/script>)/i,
    (_, opening, data, closing) => `${opening}${data.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}${closing}`,
  )
  const normalizedHtml = normalizeAnalysisDataHtml(entityEscapedHtml)
  const normalizedDataText = normalizedHtml.match(/<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] || ''
  assert.deepEqual(extractAnalysisData(entityEscapedHtml), extractAnalysisData(fixtureHtml))
  assert.doesNotMatch(normalizedDataText, /&quot;/i)
  assert.doesNotThrow(() => validateFormalAnalysisHtml(normalizedHtml, chineseSource))
  assert.equal(result.pipelineSkill, 'designer-requirement-analysis-html')
  assert.equal(result.validation.skillContract, 'designer-requirement-analysis-html')
  console.log(JSON.stringify({
    mode: result.pipelineMode,
    skill: result.pipelineSkill,
    pendingItems: result.pendingItems.length,
    progressEvents,
    validation: result.validation,
  }, null, 2))
} finally {
  fs.rmSync(dataDir, { recursive: true, force: true })
}
