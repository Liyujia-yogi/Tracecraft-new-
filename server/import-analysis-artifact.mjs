import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectPendingItems, extractAnalysisData, normalizeAnalysisDataHtml, validateFormalAnalysisHtml } from './requirement-analysis-pipeline.mjs'

const [, , requirementId, htmlInput] = process.argv
if (!requirementId || !htmlInput) {
  console.error('用法：node server/import-analysis-artifact.mjs <requirementId> <htmlPath>')
  process.exit(1)
}

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(serverDir, '..')
const dataDir = process.env.DIP_DATA_DIR ? path.resolve(process.env.DIP_DATA_DIR) : path.join(rootDir, '.data')
const dbPath = path.join(dataDir, 'db.json')
const htmlPath = path.resolve(htmlInput)
const rawHtml = fs.readFileSync(htmlPath, 'utf8')
const html = normalizeAnalysisDataHtml(rawHtml)
if (html !== rawHtml) fs.writeFileSync(htmlPath, html, 'utf8')
const validation = validateFormalAnalysisHtml(html, '', { requireDesignerContract: true })
const analysisData = extractAnalysisData(html)
const artifactHash = crypto.createHash('sha256').update(html).digest('hex')
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
const requirement = db.requirements.find((item) => item.id === requirementId)
if (!requirement) throw new Error(`需求不存在：${requirementId}`)
const existing = requirement.analysisVersions.find((item) => item.artifactHash === artifactHash)
if (existing) {
  existing.validation = validation
  existing.analysisData = analysisData
  existing.pipelineMode = 'codex-skill'
  existing.pipelineSkill = 'designer-requirement-analysis-html'
  const temporary = `${dbPath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(temporary, dbPath)
  console.log(JSON.stringify({ ok: true, updated: true, versionNo: existing.versionNo, validation }, null, 2))
  process.exit(0)
}

const versionNo = requirement.analysisVersions.length + 1
const version = {
  id: `analysis_${crypto.randomUUID().slice(0, 8)}`,
  versionNo,
  changeReason: '导入已由完整 Skill 生成并校验的参考成果',
  sourceText: requirement.source.text,
  html,
  pendingItems: collectPendingItems(analysisData).map((item) => ({
    id: `pending_${crypto.randomUUID().slice(0, 8)}`,
    ...item,
    status: 'open',
    answer: '',
  })),
  skillVersion: 'designer-requirement-analysis-html',
  pipelineMode: 'codex-skill',
  pipelineSkill: 'designer-requirement-analysis-html',
  validation,
  analysisData,
  artifactHash,
  artifactPath: htmlPath,
  createdAt: new Date().toISOString(),
  createdBy: '系统迁移（已验证 Skill 成果）',
}
requirement.analysisVersions.push(version)
requirement.currentAnalysisVersionId = version.id
requirement.summary = String(analysisData.overview?.summary || requirement.summary).slice(0, 50)
requirement.status = 'analyzed'
requirement.updatedAt = version.createdAt

const temporary = `${dbPath}.tmp`
fs.writeFileSync(temporary, JSON.stringify(db, null, 2), 'utf8')
fs.renameSync(temporary, dbPath)
console.log(JSON.stringify({ ok: true, requirementId, versionNo, validation, pendingCount: version.pendingItems.length }, null, 2))
