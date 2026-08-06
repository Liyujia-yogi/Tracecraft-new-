import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyOfficialEvidenceToCompetitors, collectOfficialEvidence, indexRequirementSource, normalizeSkillContract, validateSkillContract } from './skill-api-contract.mjs'
import { renderAnalysisHtml } from './analysis-html-template.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = process.env.DIP_DATA_DIR ? path.resolve(process.env.DIP_DATA_DIR) : path.join(rootDir, '.data')
const dbPath = path.join(dataDir, 'db.json')
const requestedId = process.argv[2] || ''
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
let refreshed = 0

for (const requirement of db.requirements || []) {
  if (requestedId && requirement.id !== requestedId) continue
  const version = requirement.analysisVersions?.find((item) => item.id === requirement.currentAnalysisVersionId)
  if (!version?.analysisData) continue
  const sourceRequirements = indexRequirementSource(requirement.source?.text, requirement.source?.filename)
  const data = normalizeSkillContract(version.analysisData, sourceRequirements)
  const officialEvidence = await collectOfficialEvidence(data.competitors.features)
  data.competitors = applyOfficialEvidenceToCompetitors(data.competitors, officialEvidence)
  data.competitorAnalysis = data.competitors.analysis
  const validation = validateSkillContract(data, sourceRequirements)
  version.analysisData = data
  version.html = renderAnalysisHtml(data)
  version.pipelineSkill = 'designer-requirement-analysis-html-api-v2-render-refreshed'
  version.validation = {
    ...(version.validation || {}),
    ok: validation.ok,
    errors: validation.errors,
    sourceRequirementCount: sourceRequirements.length,
    pageCount: data.pages.length,
    businessFlowNodeCount: data.businessFlow.swimlane.nodes.length,
    pageFlowEdgeCount: data.pageFlow.edges.length,
    afLayerCount: data.afLayers.length,
    designReviewPageCount: data.designReview.pages.length,
    competitorFeatureCount: data.competitors.features.length,
    competitorEvidenceCount: data.competitors.evidence.length,
    unmappedCount: data.coverage.filter((item) => item.status === 'missing').length,
  }
  refreshed += 1
}

if (refreshed) {
  const temporary = `${dbPath}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(temporary, dbPath)
}

console.log(JSON.stringify({ refreshed }))
