const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4319'

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${payload.message || response.status}`)
  return { response, payload }
}

const login = await request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})
const cookie = login.response.headers.get('set-cookie').split(';')[0]
const auth = { cookie }

const requirementForm = new FormData()
requirementForm.append('file', new Blob(['# 资源创建\n用户选择区域、规格和网络后创建资源，需要明确失败反馈和重试入口。'], { type: 'text/markdown' }), 'smoke.md')
requirementForm.append('productName', '冒烟测试产品')
requirementForm.append('version', '1.0')
requirementForm.append('requirementName', '资源创建需求')
const created = await request('/api/requirements', { method: 'POST', headers: auth, body: requirementForm })
const requirementId = created.payload.requirement.id

await request(`/api/requirements/${requirementId}/analyze`, {
  method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ changeReason: '冒烟测试首次解析' }),
})

let detail = (await request(`/api/requirements/${requirementId}`, { headers: auth })).payload.requirement
const pending = detail.analysisVersions.at(-1).pendingItems[0]
await request(`/api/requirements/${requirementId}/pending/${pending.id}`, {
  method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'answer', answer: '失败后保留配置并支持手动重试。' }),
})

await request(`/api/requirements/${requirementId}/analysis-feedback`, {
  method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ category: '内容缺失', target: '异常状态', description: '需要补充权限失败场景', expectedResult: '增加权限异常反馈', generalizable: true }),
})

const designForm = new FormData()
designForm.append('files', new Blob(['<!doctype html><html><body><h1>创建资源</h1><button>提交</button></body></html>'], { type: 'text/html' }), 'design.html')
await request(`/api/requirements/${requirementId}/designs`, { method: 'POST', headers: auth, body: designForm })

const reviewed = await request(`/api/requirements/${requirementId}/reviews`, { method: 'POST', headers: auth })
const issue = reviewed.payload.requirement.reviews.at(-1).issues[0]
const review = reviewed.payload.requirement.reviews.at(-1)
await request(`/api/requirements/${requirementId}/reviews/${review.id}/issues/${issue.id}`, {
  method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ disposition: 'partial', conformity: 'partial', reasonCategory: '受成本排期限制', feedbackReason: '本期先补充提示，批量能力后续实现。' }),
})

await request('/api/optimizations/requirement/run', { method: 'POST', headers: auth })
await request('/api/optimizations/review/run', { method: 'POST', headers: auth })
const bootstrap = (await request('/api/bootstrap', { headers: auth })).payload

console.log(JSON.stringify({
  login: 'ok',
  requirementCreated: requirementId,
  analysisVersions: bootstrap.requirements.find((item) => item.id === requirementId).analysisVersion,
  reviewStatus: bootstrap.requirements.find((item) => item.id === requirementId).reviewStatus,
  optimizationRuns: bootstrap.optimizationRuns.length,
}, null, 2))
