import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-feedback-storage-'))
const port = 45000 + Math.floor(Math.random() * 10000)
const baseUrl = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: rootDir,
  env: { ...process.env, DIP_DATA_DIR: dataDir, PORT: String(port), OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverError = ''
server.stderr.on('data', (chunk) => { serverError += chunk })

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${route}: ${payload.message || response.status}`)
  return { response, payload }
}

async function login() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' }),
      })
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error(`feedback smoke server did not start: ${serverError}`)
}

function readJsonLines(filename) {
  const filePath = path.join(dataDir, 'feedback', filename)
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

try {
  const loginResult = await login()
  const cookie = loginResult.response.headers.get('set-cookie').split(';')[0]
  const auth = { cookie }

  await request('/api/requirements/req_demo/analysis-feedback', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      category: '内容缺失',
      target: '术语统一',
      description: '术语需要统一',
      expectedResult: '统一术语表述',
      generalizable: true,
    }),
  })

  const designForm = new FormData()
  designForm.append('files', new Blob([fs.readFileSync(path.join(rootDir, 'index.html'))], { type: 'text/html' }), 'index.html')
  await request('/api/requirements/req_demo/designs', { method: 'POST', headers: auth, body: designForm })

  const reviewed = await request('/api/requirements/req_demo/reviews', { method: 'POST', headers: auth })
  const review = reviewed.payload.review
  const issue = review.issues[0]
  await request(`/api/requirements/req_demo/reviews/${review.id}/issues/${issue.id}`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({
      disposition: 'partial',
      conformity: 'partial',
      reasonCategory: '排期限制',
      feedbackReason: '本期部分采纳',
    }),
  })
  await request(`/api/requirements/req_demo/reviews/${review.id}/save`, { method: 'POST', headers: auth })

  await request('/api/optimizations/requirement/run', { method: 'POST', headers: auth })
  await request('/api/optimizations/review/run', { method: 'POST', headers: auth })

  const requirementFeedback = readJsonLines('requirement-analysis-feedback.jsonl')
  const reviewFeedback = readJsonLines('design-review-feedback.jsonl')
  const optimizationRuns = readJsonLines('optimization-runs.jsonl')
  if (!requirementFeedback.some((item) => item.description === '术语需要统一' && item.productName)) {
    throw new Error('requirement feedback export missing')
  }
  if (!reviewFeedback.some((item) => item.feedbackReason === '本期部分采纳' && item.reviewSaved)) {
    throw new Error('review feedback export missing')
  }
  if (optimizationRuns.length !== 2 || optimizationRuns.some((item) => item.sampleCount !== 1)) {
    throw new Error('optimization export or sample count mismatch')
  }

  console.log(JSON.stringify({
    requirementFeedback: requirementFeedback.length,
    reviewFeedback: reviewFeedback.length,
    optimizationRuns: optimizationRuns.length,
    sampleCounts: optimizationRuns.map((item) => item.sampleCount),
  }, null, 2))
} finally {
  server.kill()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
