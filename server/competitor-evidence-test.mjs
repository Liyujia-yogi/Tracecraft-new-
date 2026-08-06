import assert from 'node:assert/strict'
import { applyOfficialEvidenceToCompetitors, classifyOfficialDocumentRelevance } from './skill-api-contract.mjs'

const feature = '共享带宽实例批量续订'

assert.equal(
  classifyOfficialDocumentRelevance('共享带宽操作指南', '创建共享带宽实例，添加 EIP，修改共享带宽。', feature).evidenceStatus,
  'partial',
)
assert.equal(
  classifyOfficialDocumentRelevance('共享带宽批量续费', '支持选择多个共享带宽实例进行批量续订。', feature).evidenceStatus,
  'verified',
)
assert.equal(
  classifyOfficialDocumentRelevance('对象存储使用指南', '创建存储桶并上传对象。', feature).evidenceStatus,
  'unverified',
)

const competitors = {
  products: ['移动云', '阿里云', '华为云', '腾讯云'],
  features: [{
    name: feature,
    matrix: [
      { product: '移动云', entry: '需求入口', pageStructure: '需求页面', fields: '需求字段', flow: '需求流程', feedback: '需求反馈', resources: '需求资源', protection: '需求保护', status: 'source-fact' },
      ...['阿里云', '华为云', '腾讯云'].map((product) => ({ product, entry: '待官方文档核验', pageStructure: '待官方文档核验', fields: '待官方文档核验', flow: '待官方文档核验', feedback: '待官方文档核验', resources: '待官方文档核验', protection: '待官方文档核验', status: 'unverified' })),
    ],
  }],
  evidence: [],
}

const enriched = applyOfficialEvidenceToCompetitors(competitors, [{
  id: 'E001',
  product: '阿里云',
  feature,
  url: 'https://help.aliyun.com/zh/internet-shared-bandwidth/',
  title: '地域级别带宽共享复用能力-共享带宽-阿里云',
  excerpt: '产品概述 快速入门 创建共享带宽实例 添加EIP 修改共享带宽 使用限制',
  evidenceStatus: 'partial',
}])

const aliyun = enriched.analysis.featureEvidence[0].products.find((row) => row.product === '阿里云')
assert.equal(aliyun.status, 'partial')
assert.match(aliyun.flowAndFeedback, /创建共享带宽实例/)
assert.deepEqual(aliyun.evidenceRefs, ['E001'])
assert.equal(enriched.analysis.featureEvidence[0].products.find((row) => row.product === '华为云').status, 'not-found')
assert.ok(enriched.analysis.matrix.some((row) => row.dimension.includes('字段、默认值、必填与校验')))
assert.equal(enriched.analysis.evidence[0].url, 'https://help.aliyun.com/zh/internet-shared-bandwidth/')

console.log(JSON.stringify({ ok: true }))
