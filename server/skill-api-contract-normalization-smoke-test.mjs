import assert from 'node:assert/strict'
import { classifyOfficialDocumentRelevance, normalizeSkillContract } from './skill-api-contract.mjs'

const sourceRequirements = [{ id: 'R001', text: '支持创建、查看、检索和删除流日志。', source: 'requirement.md#L1' }]
const normalized = normalizeSkillContract({
  pages: [],
  competitors: { features: ['创建流日志', '流日志查看与检索', '流日志配额限制', '流日志删除'] },
}, sourceRequirements)

assert.deepEqual(normalized.competitors.features.map((feature) => feature.name), [
  '创建流日志',
  '流日志查看与检索',
  '流日志配额限制',
  '流日志删除',
])
assert.equal(Object.hasOwn(normalized.competitors.features[0], '0'), false)

const migrated = normalizeSkillContract({
  pages: [],
  competitors: { features: [{ 0: '创', 1: '建', 2: '流', 3: '日', 4: '志', name: '同类功能 1', matrix: [] }] },
}, sourceRequirements)
assert.equal(migrated.competitors.features[0].name, '创建流日志')
assert.equal(classifyOfficialDocumentRelevance('流日志', '支持创建流日志', '创建流日志').evidenceStatus, 'verified')
assert.equal(classifyOfficialDocumentRelevance('流日志', '支持查看流日志', '流日志配额限制').evidenceStatus, 'partial')

console.log('Skill API contract normalization smoke test passed')
