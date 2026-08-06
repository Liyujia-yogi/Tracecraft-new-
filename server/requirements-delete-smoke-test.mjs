import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(serverDir, '..')
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-delete-'))
const port = 4391
const baseUrl = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [path.join(serverDir, 'index.mjs')], {
  cwd: rootDir,
  env: { ...process.env, DIP_DATA_DIR: dataDir, PORT: String(port) },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString('utf8') })
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString('utf8') })

async function waitForServer() {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`测试服务提前退出：${serverOutput}`)
    try {
      const response = await fetch(`${baseUrl}/api/auth/session`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`测试服务启动超时：${serverOutput}`)
}

try {
  await waitForServer()
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)

  const form = new FormData()
  form.append('file', new Blob(['# Batch delete smoke test'], { type: 'text/markdown' }), 'smoke.md')
  form.append('productName', 'Batch delete smoke')
  form.append('version', 'smoke-1')
  form.append('requirementName', 'temporary requirement for delete verification')
  const createdResponse = await fetch(`${baseUrl}/api/requirements`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  assert.equal(createdResponse.status, 201)
  const created = await createdResponse.json()
  assert.equal(created.requirement.requirementName, 'temporary requirement for delete verification')
  const requirementId = created.requirement.id
  const uploadedFile = path.join(dataDir, 'uploads', created.requirement.source.savedPath)
  const analysisDirectory = path.join(dataDir, 'analysis-runs', requirementId)
  fs.mkdirSync(analysisDirectory, { recursive: true })
  fs.writeFileSync(path.join(analysisDirectory, 'artifact.html'), '<html></html>', 'utf8')
  assert.ok(fs.existsSync(uploadedFile))

  const deletedResponse = await fetch(`${baseUrl}/api/requirements`, {
    method: 'DELETE',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [requirementId] }),
  })
  assert.equal(deletedResponse.status, 200)
  const deleted = await deletedResponse.json()
  assert.equal(deleted.deletedCount, 1)
  assert.deepEqual(deleted.deletedIds, [requirementId])
  assert.equal(deleted.cleanupWarnings.length, 0)
  assert.equal(fs.existsSync(uploadedFile), false)
  assert.equal(fs.existsSync(analysisDirectory), false)

  const missingResponse = await fetch(`${baseUrl}/api/requirements/${requirementId}`, { headers: { Cookie: cookie } })
  assert.equal(missingResponse.status, 404)
  console.log(JSON.stringify({ deletedCount: deleted.deletedCount, recordStatus: missingResponse.status, uploadFileRemoved: true, analysisDirectoryRemoved: true }, null, 2))
} finally {
  server.kill()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
