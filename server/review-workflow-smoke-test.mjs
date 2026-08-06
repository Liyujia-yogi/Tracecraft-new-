import fs from 'node:fs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const base = process.env.DIP_TEST_BASE_URL || 'http://127.0.0.1:4329'
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})
const cookie = login.headers.get('set-cookie').split(';')[0]

const form = new FormData()
form.append('productName', '未解析评审测试')
form.append('version', 'V1')
form.append('summary', '测试原始需求入口')
form.append('file', new Blob([fs.readFileSync('README.md')]), 'requirement.md')
let response = await fetch(`${base}/api/requirements`, { method: 'POST', headers: { cookie }, body: form })
const created = await response.json()
if (!response.ok) throw new Error(JSON.stringify(created))

const requirementId = created.requirement.id
const designs = new FormData()
designs.append('note', '第一轮设计')
designs.append('files', new Blob([fs.readFileSync('dist/index.html')]), 'design.html')
response = await fetch(`${base}/api/requirements/${requirementId}/designs`, { method: 'POST', headers: { cookie }, body: designs })
if (!response.ok) throw new Error(await response.text())

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['能力', '竞品表现'], ['失败恢复', '支持重试']]), '功能对比')
const archive = await JSZip.loadAsync(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
archive.file('xl/media/image1.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
const competitors = new FormData()
competitors.append('featureName', '失败恢复')
competitors.append('files', new Blob([await archive.generateAsync({ type: 'nodebuffer' })]), 'competitor.xlsx')
response = await fetch(`${base}/api/requirements/${requirementId}/competitors`, { method: 'POST', headers: { cookie }, body: competitors })
const uploadedCompetitor = await response.json()
if (!response.ok) throw new Error(JSON.stringify(uploadedCompetitor))
if (uploadedCompetitor.version.evidenceStats.embeddedImageCount !== 1) throw new Error('未识别 XLSX 内嵌图片')

response = await fetch(`${base}/api/requirements/${requirementId}/reviews`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ useReviewUiDesign: true }),
})
const draft = await response.json()
if (!response.ok) throw new Error(JSON.stringify(draft))
if (draft.review.requirementEvidenceMode !== 'raw' || draft.review.saved) throw new Error('未解析需求应生成未保存的 raw 评审草稿')
if (draft.review.validationConclusion !== 'conditional' || !draft.review.experienceSkillVersion.startsWith('validate-user-experience-')) throw new Error('未解析需求未使用 validate-user-experience')
if (!draft.review.issues.some((issue) => issue.basis === 'validate_user_experience' && issue.reviewCode === 'EVA-001')) throw new Error('未生成 validate-user-experience 体验问题')
if (!draft.review.experienceGaps.length || !draft.review.experienceRetest.length) throw new Error('validate-user-experience 报告字段未保存')
if (draft.review.uiDesignReviewStatus !== 'completed' || !draft.review.uiDesignReviewSkillVersion) throw new Error('未执行可选 review-ui-design 评审')
if (!draft.review.issues.some((issue) => issue.basis === 'ui_review_skill' && issue.reviewCode === 'V1')) throw new Error('review-ui-design 意见未合并')
if (draft.review.competitorStatus !== 'completed' || !draft.review.issues.some((issue) => issue.basis === 'competitor' && issue.type === '优化建议')) {
  throw new Error('竞品意见未按优化建议合并')
}

response = await fetch(`${base}/api/requirements/${requirementId}/reviews/${draft.review.id}/save`, { method: 'POST', headers: { cookie } })
const saved = await response.json()
if (!saved.review.saved) throw new Error('评审记录保存失败')

response = await fetch(`${base}/api/requirements/${requirementId}/reviews/${draft.review.id}/issues/${draft.review.issues[0].id}`, {
  method: 'PUT',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ disposition: 'accepted' }),
})
if (response.status !== 409) throw new Error('已保存评审仍可修改')

response = await fetch(`${base}/api/bootstrap`, { headers: { cookie } })
const bootstrap = await response.json()
if (bootstrap.analytics.reviewCount !== 1) throw new Error('保存记录未进入评审数据统计')

console.log('Review workflow smoke test passed')
