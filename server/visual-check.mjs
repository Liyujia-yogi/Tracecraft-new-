import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'output', 'playwright')
fs.mkdirSync(output, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const consoleErrors = []

async function login(page) {
  await page.goto('http://127.0.0.1:4318', { waitUntil: 'networkidle' })
  await page.getByLabel('账号').fill('admin')
  await page.getByLabel('密码').fill('admin123')
  await page.getByRole('button', { name: '进入工作台' }).click()
  await page.getByRole('heading', { name: '最近需求' }).waitFor()
  await page.locator('.el-message').waitFor({ state: 'hidden' }).catch(() => {})
}

const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
const page = await desktop.newPage()
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
await page.goto('http://127.0.0.1:4318', { waitUntil: 'networkidle' })
await page.getByText('TRACECRAFT', { exact: true }).first().waitFor()
await page.screenshot({ path: path.join(output, '01-login-desktop.png'), fullPage: true })
await login(page)
await page.screenshot({ path: path.join(output, '02-dashboard-desktop.png'), fullPage: true })

await page.getByRole('menuitem', { name: '需求解析' }).click()
await page.getByRole('heading', { name: '需求解析' }).waitFor()
if (await page.locator('.el-table').count() !== 1) throw new Error('需求列表未使用 Element Plus 表格')
await page.screenshot({ path: path.join(output, '03-requirements-desktop.png'), fullPage: true })
const firstRequirementRow = page.locator('.el-table__body tbody tr').filter({ hasNotText: '解析中' }).first()
if (await firstRequirementRow.count()) {
  await firstRequirementRow.click()
  await page.getByText('返回需求列表').waitFor()
  await page.screenshot({ path: path.join(output, '04-requirement-detail-desktop.png'), fullPage: true })
  await page.route('**/api/requirements/*/analyze', async route => {
    const requirementId = new URL(route.request().url()).pathname.split('/').at(-2)
    const currentResponse = await page.request.get(`http://127.0.0.1:4318/api/requirements/${requirementId}`)
    const currentBody = await currentResponse.json()
    await new Promise(resolve => setTimeout(resolve, 1800))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requirement: currentBody.requirement, mode: 'codex-skill' }) })
  })
  await page.getByRole('button', { name: /开始解析|重新解析/ }).first().click()
  await page.getByText('正在准备需求解析').waitFor()
  await page.screenshot({ path: path.join(output, '04a-analysis-progress-desktop.png'), fullPage: true })
  await page.waitForTimeout(2000)
  await page.unroute('**/api/requirements/*/analyze')
}

await page.getByRole('menuitem', { name: '设计评审' }).click()
await page.getByRole('heading', { name: '设计评审' }).waitFor()
await page.screenshot({ path: path.join(output, '05-review-desktop.png'), fullPage: true })

await page.getByRole('menuitem', { name: '评审数据' }).click()
await page.getByRole('heading', { name: '评审数据' }).waitFor()
if (await page.locator('.el-progress').count() < 1) throw new Error('评审数据进度组件未渲染')
await page.screenshot({ path: path.join(output, '06-analytics-desktop.png'), fullPage: true })

await page.getByRole('menuitem', { name: '模型设置' }).click()
await page.getByRole('heading', { name: '模型与 API Key' }).waitFor()
await page.screenshot({ path: path.join(output, '07-settings-desktop.png'), fullPage: true })

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
const mobilePage = await mobile.newPage()
mobilePage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
await mobilePage.goto('http://127.0.0.1:4318', { waitUntil: 'networkidle' })
await mobilePage.screenshot({ path: path.join(output, '08-login-mobile.png'), fullPage: true })
await login(mobilePage)
await mobilePage.screenshot({ path: path.join(output, '09-dashboard-mobile.png'), fullPage: true })
await mobilePage.getByRole('button', { name: '展开导航' }).click()
await mobilePage.locator('.el-drawer').waitFor()
await mobilePage.screenshot({ path: path.join(output, '10-navigation-mobile.png'), fullPage: true })
await mobilePage.locator('.el-drawer').getByRole('menuitem', { name: '评审数据' }).click()
await mobilePage.getByRole('heading', { name: '评审数据' }).waitFor()
await mobilePage.locator('.el-drawer').waitFor({ state: 'hidden' })
await mobilePage.screenshot({ path: path.join(output, '11-analytics-mobile.png'), fullPage: true })

await browser.close()
console.log(JSON.stringify({ screenshots: 12, consoleErrors }, null, 2))
