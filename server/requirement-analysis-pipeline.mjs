import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const MIN_FORMAL_HTML_SIZE = 24_000
const DEFAULT_TIMEOUT_MS = 45 * 60 * 1000
const HAN_CHARACTER_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/g
const SUSPICIOUS_QUESTION_MARK_PATTERN = /\?{3,}/g
const DESIGNER_SKILL_NAME = 'designer-requirement-analysis-html'
const DESIGNER_HTML_MARKERS = [
  'tab-requirement-analysis',
  'tab-design-review',
  'tab-competitor-analysis',
  'overview-global-blockers',
  'business-swimlane',
  'page-detail-context',
  'page-detail-core',
  'page-detail-outcome-review',
]
const DESIGNER_UI_MARKERS = ['#f4f6fa', '#172033', '#667085', '#4657c8', '#d9dfeb', 'PingFang SC', 'Microsoft YaHei']

function safeSegment(value) {
  return String(value || 'requirement')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'requirement'
}

function newestFile(files) {
  return files
    .map((file) => ({ file, time: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.time - a.time)[0]?.file
}

function walkFiles(directory, extension, results = []) {
  if (!fs.existsSync(directory)) return results
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(absolute, extension, results)
    else if (entry.name.toLowerCase().endsWith(extension)) results.push(absolute)
  }
  return results
}

function resolveCodexEntry() {
  if (process.env.DIP_CODEX_SCRIPT && fs.existsSync(process.env.DIP_CODEX_SCRIPT)) {
    return path.resolve(process.env.DIP_CODEX_SCRIPT)
  }
  const appData = process.env.APPDATA
  const candidate = appData ? path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js') : ''
  if (candidate && fs.existsSync(candidate)) return candidate
  throw new Error('未找到本机 Codex。请先安装并登录 Codex，再重新解析。')
}

function runCodex({ workingDir, prompt, outputMessagePath, logPath, completionPaths }) {
  const codexEntry = resolveCodexEntry()
  const timeoutMs = Number(process.env.DIP_ANALYSIS_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  const sandboxMode = process.platform === 'win32' ? 'danger-full-access' : 'workspace-write'
  const args = [
    'exec',
    '-',
    '--cd',
    workingDir,
    '--sandbox',
    sandboxMode,
    '--skip-git-repo-check',
    '--ephemeral',
    '--color',
    'never',
    '--output-last-message',
    outputMessagePath,
  ]

  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(logPath, { flags: 'a' })
    const child = spawn(process.execPath, [codexEntry, ...args], {
      cwd: workingDir,
      env: { ...process.env, NO_COLOR: '1' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let tail = ''
    let settled = false
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(completionTimer)
      log.end()
      callback()
    }
    const capture = (chunk) => {
      const text = chunk.toString('utf8')
      log.write(text)
      tail = `${tail}${text}`.slice(-8_000)
    }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', (error) => {
      finish(() => reject(new Error(`无法启动 Codex Skill：${error.message}`)))
    })
    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`需求解析超过 ${Math.round(timeoutMs / 60_000)} 分钟，已停止本次运行。`)))
    }, timeoutMs)
    const completionTimer = setInterval(() => {
      const hasFinalMessage = fs.existsSync(outputMessagePath) && fs.statSync(outputMessagePath).size > 0
      if (hasFinalMessage && completionPaths.every((file) => fs.existsSync(file))) {
        finish(() => resolve({ code: 0, tail }))
        child.kill()
      }
    }, 1_000)
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) resolve({ code, tail })
        else reject(new Error(`Codex Skill 执行失败（退出码 ${code}）。${tail.trim().slice(-1200)}`))
      })
    })
    child.stdin.end(prompt, 'utf8')
  })
}

export function extractAnalysisData(html) {
  const match = html.match(/<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error('解析结果缺少 analysis-data 结构化数据。')
  const raw = match[1].replace(/<\\\//g, '</').trim()
  const decoded = raw.replace(/&(quot|amp|lt|gt|#39|#x[0-9a-f]+|#\d+);/gi, (entity, code) => {
    const named = { quot: '"', amp: '&', lt: '<', gt: '>', '#39': "'" }
    const normalized = code.toLowerCase()
    if (named[normalized]) return named[normalized]
    const value = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10)
    return Number.isFinite(value) ? String.fromCodePoint(value) : entity
  })
  let lastError
  for (const candidate of decoded === raw ? [raw] : [raw, decoded]) {
    try {
      return JSON.parse(candidate)
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`analysis-data 不是有效 JSON：${lastError.message}`)
}

export function normalizeAnalysisDataHtml(html) {
  const pattern = /(<script[^>]+id=["'](?:analysis-data|analysis-json)["'][^>]*>)([\s\S]*?)(<\/script>)/i
  const match = html.match(pattern)
  if (!match) throw new Error('解析结果缺少 analysis-data 结构化数据。')
  const data = extractAnalysisData(html)
  const serialized = JSON.stringify(data)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
  const start = match.index
  return `${html.slice(0, start)}${match[1]}${serialized}${match[3]}${html.slice(start + match[0].length)}`
}

function matchCount(value, pattern) {
  return String(value || '').match(pattern)?.length || 0
}

export function validateTextEncoding(label, text, sourceText = '') {
  const content = String(text || '')
  const sourceHanCount = matchCount(sourceText, HAN_CHARACTER_PATTERN)
  const hanCount = matchCount(content, HAN_CHARACTER_PATTERN)
  const questionMarkCount = matchCount(content, /\?/g)
  const replacementCharacterCount = matchCount(content, /\uFFFD/g)
  const suspiciousQuestionMarkRuns = matchCount(content, SUSPICIOUS_QUESTION_MARK_PATTERN)

  if (replacementCharacterCount || suspiciousQuestionMarkRuns >= 2 || questionMarkCount >= 1000) {
    throw new Error(`${label}疑似发生编码损坏：检测到 ${questionMarkCount} 个问号、${suspiciousQuestionMarkRuns} 段连续问号和 ${replacementCharacterCount} 个替换字符，已拒绝发布。`)
  }

  if (sourceHanCount >= 20) {
    const minimumHanCount = Math.max(20, Math.floor(sourceHanCount * 0.05))
    if (hanCount < minimumHanCount) {
      throw new Error(`${label}中文内容异常缺失：原文包含 ${sourceHanCount} 个中文字符，当前产物仅包含 ${hanCount} 个，已拒绝发布。`)
    }
  }

  return { hanCount, questionMarkCount, replacementCharacterCount, suspiciousQuestionMarkRuns }
}

function businessFlowCount(data) {
  const flow = data.businessFlow || {}
  if (Array.isArray(flow.swimlane?.nodes)) return flow.swimlane.nodes.length
  if (Array.isArray(flow.nodes)) return flow.nodes.length
  if (Array.isArray(flow.swimlanes)) {
    return flow.swimlanes.reduce((total, lane) => total + (Array.isArray(lane.steps) ? lane.steps.length : 0), 0)
  }
  if (Array.isArray(flow.lanes)) {
    return flow.lanes.reduce((total, lane) => total + (Array.isArray(lane.steps) ? lane.steps.length : 0), 0)
  }
  return 0
}

function sourceCoverage(data) {
  const coverage = data.coverage
  if (Array.isArray(coverage)) {
    return {
      total: coverage.length,
      unmapped: coverage.filter((item) => item.status === 'unmapped' || item.status === 'missing').length,
    }
  }
  const sourceRequirements = coverage?.sourceRequirements || data.requirements || []
  return {
    total: Array.isArray(sourceRequirements) ? sourceRequirements.length : 0,
    unmapped: Array.isArray(coverage?.unmapped) ? coverage.unmapped.length : 0,
  }
}

export function validateFormalAnalysisHtml(html, sourceText = '', options = {}) {
  if (!html || html.length < MIN_FORMAL_HTML_SIZE) {
    throw new Error('解析结果内容过短，未达到正式需求解析的完整度门槛。')
  }
  const data = extractAnalysisData(html)
  const textEncoding = validateTextEncoding('最终结构化解析数据', JSON.stringify(data), sourceText)
  const pages = Array.isArray(data.pages) ? data.pages : []
  const flowPages = Array.isArray(data.pageFlow?.pages) ? data.pageFlow.pages : []
  const pageEdges = Array.isArray(data.pageFlow?.edges) ? data.pageFlow.edges : []
  const flowNodes = businessFlowCount(data)
  const reviewPages = Array.isArray(data.designReview?.pages) ? data.designReview.pages : []
  const competitor = data.competitorAnalysis || data.competitors || {}
  const competitorFeatures = competitor.matrix || competitor.features || []
  const competitorEvidence = competitor.evidence || []
  const afLayers = data.businessFlow?.afLayers || data.afLayers || []
  const coverage = sourceCoverage(data)
  const pageIds = pages.map((item) => item.id).filter(Boolean)
  const flowIds = flowPages.map((item) => item.id).filter(Boolean)
  const reviewIds = reviewPages.map((item) => item.pageId || item.id).filter(Boolean)

  if (!pages.length) throw new Error('解析结果没有逐页面详情。')
  if (!flowPages.length) throw new Error('解析结果没有页面流程节点。')
  if (!flowNodes) throw new Error('解析结果没有业务泳道节点。')
  if (!Array.isArray(afLayers) || afLayers.length < 6) throw new Error('解析结果缺少完整 A-F 业务分层。')
  if (pages.length > 1 && !pageEdges.length) throw new Error('解析结果缺少页面流程连线。')
  const pageIdSet = new Set(pageIds)
  if (pageIds.length !== flowIds.length || flowIds.some((id) => !pageIdSet.has(id))) throw new Error('页面详情与页面流程的页面 ID 不一致。')
  if (reviewPages.length !== pages.length || new Set(reviewIds).size !== pageIds.length || reviewIds.some((id) => !pageIdSet.has(id))) throw new Error('设计要点没有覆盖全部页面。')
  if (!Array.isArray(competitorFeatures) || !competitorFeatures.length) throw new Error('解析结果缺少同类功能竞品对比矩阵。')
  if (coverage.unmapped) throw new Error(`仍有 ${coverage.unmapped} 条原文未映射，不能发布正式解析版本。`)
  if (!/需求解析/.test(html) || !/设计要点/.test(html) || !/(同类功能竞品|竞品分析)/.test(html)) {
    throw new Error('解析结果缺少三个固定顶层模块。')
  }
  if (options.requireDesignerContract) {
    for (const marker of DESIGNER_HTML_MARKERS) {
      if (!html.includes(marker)) throw new Error(`解析结果缺少新版 Skill 布局标识：${marker}`)
    }
    for (const marker of DESIGNER_UI_MARKERS) {
      if (!html.includes(marker)) throw new Error(`解析结果未采用新版 Skill 固定 UI 基线：${marker}`)
    }
    const blockers = data.overview?.globalBlockers
    if (!Array.isArray(blockers) || blockers.length > 5) throw new Error('overview.globalBlockers 必须为数组且最多 5 条。')
    if (data.designReview?.globalBlockers?.length) throw new Error('全局阻塞问题只能出现在需求总览，设计要点中不得重复。')
    const requirementIds = Array.isArray(data.requirements) ? data.requirements.map((item) => item.id) : []
    if (!requirementIds.length || requirementIds.some((id) => !/^R\d{3,}$/.test(id)) || new Set(requirementIds).size !== requirementIds.length) {
      throw new Error('requirements 必须包含唯一且有效的 Rxxx 原文编号。')
    }
    const coverageIds = Array.isArray(data.coverage) ? data.coverage.map((item) => item.sourceId) : []
    if (coverageIds.length !== requirementIds.length || requirementIds.some((id) => !coverageIds.includes(id))) {
      throw new Error('coverage 必须为每条 Rxxx 提供唯一覆盖状态。')
    }
    const swimlane = data.businessFlow?.swimlane
    if (!swimlane || !Array.isArray(swimlane.phases) || !Array.isArray(swimlane.lanes) || !Array.isArray(swimlane.nodes) || !swimlane.phases.length || !swimlane.lanes.length || !swimlane.nodes.length) {
      throw new Error('解析结果缺少新版阶段×参与方业务泳道数据。')
    }
    const phaseIds = new Set(swimlane.phases.map((item) => item.id))
    const laneIds = new Set(swimlane.lanes.map((item) => item.id))
    const nodeIds = new Set(swimlane.nodes.map((item) => item.id))
    if (swimlane.nodes.some((node) => !phaseIds.has(node.phase) || !laneIds.has(node.lane) || (!node.pageId && node.systemAction !== true))) {
      throw new Error('业务泳道节点必须定位有效阶段、参与方，并在无 pageId 时标记 systemAction=true。')
    }
    if ((swimlane.edges || []).some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))) throw new Error('业务泳道存在无效连线端点。')
    if (pages.some((page) => !['source_fact', 'design_required'].includes(page.origin))) {
      throw new Error('页面 origin 必须为 source_fact 或 design_required。')
    }
    const requiredProducts = ['移动云', '阿里云', '华为云', '腾讯云']
    const products = Array.isArray(data.competitors?.products) ? data.competitors.products : []
    if (requiredProducts.some((product) => !products.includes(product))) throw new Error('竞品范围必须包含移动云、阿里云、华为云、腾讯云。')
    const evidence = Array.isArray(data.competitors?.evidence) ? data.competitors.evidence : []
    const evidenceStatuses = ['verified', 'docs-only', 'login-blocked', 'inaccessible', 'not-found']
    if (requiredProducts.some((product) => !evidence.some((item) => item.product === product)) || evidence.some((item) => !evidenceStatuses.includes(item.status))) {
      throw new Error('竞品证据必须覆盖四个产品并使用新版证据状态。')
    }
    if (!data.knowledgeRetrieval?.knowleddge?.status || !data.knowledgeRetrieval?.['fallback-kb']?.status) {
      throw new Error('解析结果缺少 knowleddge / fallback-kb 检索状态。')
    }
  }

  return {
    ok: true,
    pageCount: pages.length,
    businessFlowNodeCount: flowNodes,
    pageFlowEdgeCount: pageEdges.length,
    afLayerCount: afLayers.length,
    designReviewPageCount: reviewPages.length,
    competitorFeatureCount: competitorFeatures.length,
    competitorEvidenceCount: Array.isArray(competitorEvidence) ? competitorEvidence.length : 0,
    sourceRequirementCount: coverage.total,
    unmappedCount: coverage.unmapped,
    textEncoding,
    skillContract: options.requireDesignerContract ? DESIGNER_SKILL_NAME : 'legacy',
  }
}

function readJsonArtifact(label, artifactPath) {
  if (!fs.existsSync(artifactPath)) throw new Error(`${label}未生成，不能发布正式解析版本。`)
  const text = fs.readFileSync(artifactPath, 'utf8')
  validateTextEncoding(label, text)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label}不是有效 JSON：${error.message}`)
  }
}

function validateDesignerArtifacts({ analysisDataPath, pageFlowSchemaPath, coverageLedgerPath, embeddedData }) {
  const analysisData = readJsonArtifact('analysis-data.json', analysisDataPath)
  const pageFlow = readJsonArtifact('page_flow_schema.json', pageFlowSchemaPath)
  const coverageLedger = readJsonArtifact('coverage-ledger.json', coverageLedgerPath)
  if (!isDeepStrictEqual(analysisData, embeddedData)) throw new Error('analysis-data.json 与最终 HTML 内嵌结构化数据不一致。')
  const pageIds = new Set((analysisData.pages || []).map((item) => item.id).filter(Boolean))
  const flowIds = (pageFlow.pages || []).map((item) => item.id).filter(Boolean)
  if (pageIds.size !== flowIds.length || flowIds.some((id) => !pageIds.has(id))) throw new Error('page_flow_schema.json 与 analysis-data.json 的页面 ID 不一致。')
  const coverage = Array.isArray(coverageLedger) ? coverageLedger : coverageLedger.coverage
  if (!Array.isArray(coverage) || !isDeepStrictEqual(coverage, analysisData.coverage)) throw new Error('coverage-ledger.json 与 analysis-data.json 的覆盖账本不一致。')
  return analysisData
}

function compactText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('；')
  if (value && typeof value === 'object') return Object.values(value).filter(Boolean).join('；')
  return String(value || '')
}

export function collectPendingItems(data) {
  const candidates = []
  for (const blocker of data.overview?.globalBlockers || []) {
    candidates.push({
      title: blocker.title || blocker.question || '全局问题待确认',
      description: blocker.decision || blocker.description || blocker.consequence || compactText(blocker.options),
      sourceHint: compactText(blocker.sources || blocker.sourceRefs || blocker.impact),
    })
  }
  for (const blocker of data.designReview?.globalBlockers || []) {
    candidates.push({
      title: blocker.title || blocker.question || '全局问题待确认',
      description: blocker.decision || blocker.description || blocker.consequence || compactText(blocker.options),
      sourceHint: compactText(blocker.sources || blocker.sourceRefs || blocker.impact),
    })
  }
  for (const page of data.pages || []) {
    const questions = page.pendingItems || page.pendingQuestions || page.openQuestions || []
    for (const question of questions) {
      candidates.push({
        title: question.title || question.question || `${page.title || page.name || '页面'}待确认项`,
        description: question.description || question.reason || question.detail || compactText(question.options),
        sourceHint: compactText(question.sourceRefs || question.sources) || page.title || page.name || '',
      })
    }
  }
  const seen = new Set()
  return candidates
    .map((item) => ({
      title: compactText(item.title).trim(),
      description: compactText(item.description).trim(),
      sourceHint: compactText(item.sourceHint).trim(),
    }))
    .filter((item) => item.title && item.description)
    .filter((item) => {
      const key = `${item.title}|${item.description}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function buildPrompt({
  requirement,
  sourcePath,
  editedSourcePath,
  runDir,
  sourceIndexedPath,
  requirementJsonPath,
  designJsonPath,
  competitorJsonPath,
  analysisDataPath,
  pageFlowSchemaPath,
  coverageLedgerPath,
  htmlPath,
  answered,
  ignored,
}) {
  const answeredText = answered.length
    ? answered.map((item) => `- ${item.title}：${item.answer}`).join('\n')
    : '- 无'
  const ignoredItemList = ignored.length ? ignored.map((item) => `- ${item.title}`).join('\n') : '- 无'
  const ignoredItemsText = `${ignoredItemList}\n\nHTML 数据嵌入约束：analysis-data / analysis-json 的 script 标签内容必须是 JSON.stringify 生成的严格 JSON 原文，禁止再调用 HTML 转义函数，禁止生成 &quot;、&amp; 等实体；为避免结束 script 标签，只把小于号写成 Unicode 转义。写入后必须实际执行 JSON.parse 校验。`
  const ignoredText = `${ignoredItemsText}\n\nWindows UTF-8 安全约束：禁止使用 PowerShell here-string、字符串或 Get-Content 通过管道把包含中文的 JavaScript、Python、JSON、Markdown 或 HTML 传给 node/python 等原生程序。包含中文的代码必须先以 UTF-8 文件方式创建为 .cjs/.mjs/.py 后再执行，优先使用 apply_patch 或 Skill 自带脚本；每次写入后必须检查中文字符和连续问号，发现损坏须从原文重新生成，不能发布。`
  return `使用 $designer-requirement-analysis-html skill 完整执行本次需求解析。这是平台生产解析任务，必须完整读取该 Skill、强制引用文件、JSON 模板、业务泳道示例图和新版校验器；不能调用旧的 $analyze-requirements-for-designers 替代，也不能用简化提示词、摘要、演示数据或自由设计 UI。

产品：${requirement.productName}
产品版本：${requirement.version}
原始需求文件：${sourcePath || '无，仅使用下方编辑原文'}
平台编辑后的需求原文：${editedSourcePath}
运行目录：${runDir}
编号原文必须写入：${sourceIndexedPath}
需求解析 JSON 必须写入：${requirementJsonPath}
设计要点 JSON 必须写入：${designJsonPath}
竞品分析 JSON 必须写入：${competitorJsonPath}
analysis-data.json 必须写入：${analysisDataPath}
page_flow_schema.json 必须写入：${pageFlowSchemaPath}
coverage-ledger.json 必须写入：${coverageLedgerPath}
最终 HTML 必须写入：${htmlPath}

已确认答复（作为本次需求事实补充）：
${answeredText}

已忽略且本次不要再次提出的待确认项：
${ignoredText}

执行要求：
1. 完整读取原始 DOCX/Markdown；DOCX 必须覆盖段落、标题、表格、图片、批注、页眉页脚和嵌入附件，不能只抽取纯文本。
2. 对原文建立稳定 R001... 编号；三份旧命名 JSON 仅作为平台阶段进度快照，每完成一个阶段立即写入。最终正式数据必须以 analysis-data.json、page_flow_schema.json、coverage-ledger.json 为准，并与 HTML 内嵌数据完全一致。
3. 业务泳道图必须使用 businessFlow.swimlane 的阶段×参与方二维网格、正交连线和双层节点文案；页面流程图由 page_flow_schema.json 独立驱动。两张图均由代码渲染，禁止模型直接画图、普通步骤卡片或文字链路。
4. 逐页面详情固定使用 page-detail-context、page-detail-core、page-detail-outcome-review 三个整合区块；A-F 六层、跨页面约束、总览全局阻塞问题、全部页面风险、术语和来源覆盖台账必须完整。
5. coverage 的 missing 必须为 0；pages、pageFlow.pages、page_flow_schema.pages、designReview.pages 必须一一对应；overview.globalBlockers 最多 5 条且 designReview.globalBlockers 必须为空。
6. 严格采用新版 Skill 的固定 UI 基线和 DOM 标识，禁止复用旧 Skill 的 requirement-analysis-template.html 或自行改换视觉方向；运行新版 validate_analysis_bundle.py 或做等价完整校验。
7. 所有中间文件和最终文件只写入运行目录，不修改平台代码、数据库或其他目录。
8. HTML 中的 analysis-data 必须来自 analysis-data.json；内嵌 JSON 的 <、>、& 必须分别编码为 Unicode 转义。
9. 完成前逐项确认新版 DOM 标识、固定配色字体、二维业务泳道、三个页面详情区块以及五件套产物均已生成。
10. 完成后确认最终 HTML 已写到指定绝对路径；不要只在回复中粘贴 HTML。`
}

const progressDefinitions = [
  { id: 'source', label: '原文读取与编号', description: '读取段落、表格、图片、批注和嵌入附件', weight: 15 },
  { id: 'requirement', label: '需求结构解析', description: '生成二维业务泳道、A-F 分层、页面流程和整合式逐页详情', weight: 30 },
  { id: 'design', label: '设计要点归纳', description: '汇总跨页面约束、阻塞问题和全部页面风险', weight: 18 },
  { id: 'competitor', label: '同类竞品分析', description: '整理竞品功能矩阵、证据和设计启示', weight: 18 },
  { id: 'assemble', label: 'HTML 组装', description: '使用新版固定 UI 基线渲染交互式单文件 HTML', weight: 12 },
  { id: 'validate', label: '完整度校验', description: '检查五件套产物、原文覆盖、页面对应关系和新版 DOM 标识', weight: 7 },
]

function makeProgress({ sourceIndexedPath, requirementJsonPath, designJsonPath, competitorJsonPath, htmlPath }, validationComplete = false) {
  const complete = {
    source: fs.existsSync(sourceIndexedPath),
    requirement: fs.existsSync(requirementJsonPath),
    design: fs.existsSync(designJsonPath),
    competitor: fs.existsSync(competitorJsonPath),
    assemble: fs.existsSync(htmlPath),
    validate: validationComplete,
  }
  const active = {
    source: !complete.source,
    requirement: complete.source && !complete.requirement,
    design: complete.requirement && !complete.design,
    competitor: complete.requirement && !complete.competitor,
    assemble: complete.design && complete.competitor && !complete.assemble,
    validate: complete.assemble && !complete.validate,
  }
  const steps = progressDefinitions.map((step) => ({
    id: step.id,
    label: step.label,
    description: step.description,
    status: complete[step.id] ? 'completed' : active[step.id] ? 'active' : 'pending',
  }))
  const completedPercent = progressDefinitions.reduce((total, step) => total + (complete[step.id] ? step.weight : 0), 0)
  const percent = validationComplete ? 100 : Math.min(96, completedPercent + 5)
  let title = '正在完整读取并编号需求材料'
  let detail = '会保留文档中的表格、图片、批注、页眉页脚和嵌入附件。'
  if (complete.source && !complete.requirement) {
    title = '正在解析业务流程、页面架构与逐页详情'
    detail = '正在生成阶段×参与方业务泳道、A-F 分层、页面跳转和整合式页面详情。'
  } else if (complete.requirement && (!complete.design || !complete.competitor)) {
    title = '正在生成设计要点与同类竞品分析'
    detail = '设计风险与竞品取证并行进行，完成时间取决于需求规模和证据访问情况。'
  } else if (complete.design && complete.competitor && !complete.assemble) {
    title = '正在组装交互式需求解析 HTML'
    detail = '把新版五件套数据组装为固定视觉基线 HTML，并渲染两张独立流程图。'
  } else if (complete.assemble && !complete.validate) {
    title = '正在执行完整度与一致性校验'
    detail = '检查五件套数据一致性、原文覆盖、页面风险、泳道节点和新版 UI 标识。'
  } else if (validationComplete) {
    title = '完整 Skill 解析已完成'
    detail = '正式解析版本已通过全部质量门禁。'
  }
  return { percent, title, detail, steps }
}

export async function runRequirementAnalysisPipeline({ dataDir, uploadDir, requirement, answered = [], ignored = [], onProgress }) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`
  const runDir = path.join(dataDir, 'analysis-runs', requirement.id, runId)
  fs.mkdirSync(runDir, { recursive: true })
  const sourcePath = requirement.source.savedPath ? path.join(uploadDir, requirement.source.savedPath) : ''
  if (sourcePath && !fs.existsSync(sourcePath)) throw new Error('原始需求文件不存在，无法执行完整结构化解析。')
  const editedSourcePath = path.join(runDir, 'platform-edited-source.md')
  fs.writeFileSync(editedSourcePath, requirement.source.text || '', 'utf8')
  const sourceIndexedPath = path.join(runDir, 'requirement_source_indexed.md')
  const requirementJsonPath = path.join(runDir, '01-requirement-analysis.json')
  const designJsonPath = path.join(runDir, '02-design-review.json')
  const competitorJsonPath = path.join(runDir, '03-competitor-analysis.json')
  const analysisDataPath = path.join(runDir, 'analysis-data.json')
  const pageFlowSchemaPath = path.join(runDir, 'page_flow_schema.json')
  const coverageLedgerPath = path.join(runDir, 'coverage-ledger.json')
  const htmlPath = path.join(runDir, `${safeSegment(requirement.productName)}-需求设计分析-v1.0.html`)
  const outputMessagePath = path.join(runDir, 'codex-final-message.txt')
  const logPath = path.join(runDir, 'codex-run.log')
  const progressPaths = { sourceIndexedPath, requirementJsonPath, designJsonPath, competitorJsonPath, htmlPath }
  const prompt = buildPrompt({ requirement, sourcePath, editedSourcePath, runDir, ...progressPaths, analysisDataPath, pageFlowSchemaPath, coverageLedgerPath, answered, ignored })
  fs.writeFileSync(path.join(runDir, 'run-manifest.json'), JSON.stringify({
    runId,
    requirementId: requirement.id,
    sourcePath,
    editedSourcePath,
    htmlPath,
    skill: DESIGNER_SKILL_NAME,
    pipelineVersion: DESIGNER_SKILL_NAME,
    analysisDataPath,
    pageFlowSchemaPath,
    coverageLedgerPath,
    startedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  let lastProgress = ''
  const reportProgress = (validationComplete = false) => {
    const progress = makeProgress(progressPaths, validationComplete)
    const signature = JSON.stringify(progress)
    if (signature !== lastProgress) {
      lastProgress = signature
      onProgress?.(progress)
    }
  }
  reportProgress()
  const progressTimer = setInterval(() => reportProgress(), 900)
  try {
    await runCodex({
      workingDir: runDir,
      prompt,
      outputMessagePath,
      logPath,
      completionPaths: [sourceIndexedPath, requirementJsonPath, designJsonPath, competitorJsonPath, analysisDataPath, pageFlowSchemaPath, coverageLedgerPath, htmlPath],
    })
  } finally {
    clearInterval(progressTimer)
  }
  reportProgress()
  const sourceText = requirement.source.text || ''
  for (const [label, artifactPath] of [
    ['编号原文', sourceIndexedPath],
    ['需求解析 JSON', requirementJsonPath],
    ['设计要点 JSON', designJsonPath],
    ['竞品分析 JSON', competitorJsonPath],
  ]) {
    if (!fs.existsSync(artifactPath)) throw new Error(`${label}未生成，不能发布正式解析版本。`)
    validateTextEncoding(label, fs.readFileSync(artifactPath, 'utf8'))
  }
  for (const [label, artifactPath] of [
    ['analysis-data.json', analysisDataPath],
    ['page_flow_schema.json', pageFlowSchemaPath],
    ['coverage-ledger.json', coverageLedgerPath],
  ]) {
    if (!fs.existsSync(artifactPath)) throw new Error(`${label}未生成，不能发布新版 Skill 解析结果。`)
  }
  const producedHtml = fs.existsSync(htmlPath) ? htmlPath : newestFile(walkFiles(runDir, '.html'))
  if (!producedHtml) {
    const finalMessage = fs.existsSync(outputMessagePath) ? fs.readFileSync(outputMessagePath, 'utf8').trim() : ''
    throw new Error(finalMessage ? `Codex Skill 未生成最终 HTML：${finalMessage.slice(0, 1200)}` : 'Codex Skill 已结束，但没有生成最终 HTML。')
  }
  const rawHtml = fs.readFileSync(producedHtml, 'utf8')
  const html = normalizeAnalysisDataHtml(rawHtml)
  if (html !== rawHtml) fs.writeFileSync(producedHtml, html, 'utf8')
  const validation = validateFormalAnalysisHtml(html, sourceText, { requireDesignerContract: true })
  const embeddedData = extractAnalysisData(html)
  const data = validateDesignerArtifacts({ analysisDataPath, pageFlowSchemaPath, coverageLedgerPath, embeddedData })
  reportProgress(true)
  return {
    summary: data.overview?.summary || requirement.summary,
    html,
    analysisData: data,
    pendingItems: collectPendingItems(data),
    pipelineMode: 'codex-skill',
    pipelineSkill: DESIGNER_SKILL_NAME,
    validation,
    runId,
    artifactPath: path.relative(dataDir, producedHtml).replaceAll('\\', '/'),
  }
}

export function recoverRequirementAnalysisPipeline({ dataDir, requirement }) {
  const root = path.join(dataDir, 'analysis-runs', requirement.id)
  if (!fs.existsSync(root)) return null
  const runDirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)

  for (const runDir of runDirs) {
    const analysisDataPath = path.join(runDir, 'analysis-data.json')
    const pageFlowSchemaPath = path.join(runDir, 'page_flow_schema.json')
    const coverageLedgerPath = path.join(runDir, 'coverage-ledger.json')
    const sourceIndexedPath = path.join(runDir, 'requirement_source_indexed.md')
    const required = [analysisDataPath, pageFlowSchemaPath, coverageLedgerPath, sourceIndexedPath]
    if (required.some((file) => !fs.existsSync(file))) continue
    const htmlPath = newestFile(walkFiles(runDir, '.html'))
    if (!htmlPath) continue
    try {
      const rawHtml = fs.readFileSync(htmlPath, 'utf8')
      const html = normalizeAnalysisDataHtml(rawHtml)
      if (html !== rawHtml) fs.writeFileSync(htmlPath, html, 'utf8')
      const validation = validateFormalAnalysisHtml(html, requirement.source.text || '', { requireDesignerContract: true })
      const analysisData = validateDesignerArtifacts({
        analysisDataPath,
        pageFlowSchemaPath,
        coverageLedgerPath,
        embeddedData: extractAnalysisData(html),
      })
      const manifestPath = path.join(runDir, 'run-manifest.json')
      const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {}
      const deepSeekRunner = manifest.runner === 'deepseek-tool-loop-v1'
      return {
        summary: analysisData.overview?.summary || requirement.summary,
        html,
        analysisData,
        pendingItems: collectPendingItems(analysisData),
        pipelineMode: deepSeekRunner ? 'deepseek-skill-runner' : 'codex-skill',
        pipelineSkill: deepSeekRunner ? 'designer-requirement-analysis-html-tool-loop-v1' : DESIGNER_SKILL_NAME,
        validation,
        runId: path.basename(runDir),
        artifactPath: path.relative(dataDir, htmlPath).replaceAll('\\', '/'),
      }
    } catch {
      // Try the next completed run; invalid artifacts remain unavailable for recovery.
    }
  }
  return null
}
