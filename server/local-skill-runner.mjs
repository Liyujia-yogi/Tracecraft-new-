import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import mammoth from 'mammoth'
import { applyOfficialEvidenceToCompetitors, collectOfficialEvidence, indexRequirementSource, normalizeSkillContract, validateSkillContract } from './skill-api-contract.mjs'
import { renderAnalysisHtml } from './analysis-html-template.mjs'

const MAX_TURNS = 36
const DOCUMENT_CHUNK_SIZE = 12_000
const ARTIFACTS = new Set(['analysis-data.json', 'page_flow_schema.json', 'coverage-ledger.json', 'requirement_source_indexed.md'])
const ANALYSIS_SECTIONS = new Set(['overview', 'businessFlow', 'afLayers', 'pageFlow', 'designReview', 'competitors', 'knowledgeRetrieval'])
const PRODUCTS = ['移动云', '阿里云', '华为云', '腾讯云']
const runnerDir = path.dirname(fileURLToPath(import.meta.url))

const json = (value) => JSON.stringify(value, null, 2)
const unique = (values) => [...new Set(values.filter(Boolean))]

function pythonCandidates() {
  const bundled = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe') : ''
  return unique([
    process.env.DIP_PYTHON,
    bundled && fs.existsSync(bundled) ? bundled : '',
    process.platform === 'win32' ? 'py' : 'python3',
    process.platform === 'win32' ? 'python3' : 'python',
    'python',
  ]).map((command) => ({ command, prefix: command === 'py' ? ['-3'] : [] }))
}

function runPython(args, cwd) {
  const candidates = pythonCandidates()
  return new Promise((resolve) => {
    const attempt = (index) => {
      if (index >= candidates.length) return resolve({ ok: false, unavailable: true, output: '未找到可用 Python；可通过 DIP_PYTHON 指定 Python 可执行文件。' })
      const candidate = candidates[index]
      const child = spawn(candidate.command, [...candidate.prefix, ...args], { cwd, windowsHide: true })
      let output = ''
      let settled = false
      child.stdout.on('data', (chunk) => { output += chunk.toString('utf8') })
      child.stderr.on('data', (chunk) => { output += chunk.toString('utf8') })
      child.on('error', () => {
        if (settled) return
        settled = true
        attempt(index + 1)
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        if (code === 9009 || /Python was not found|not recognized as an internal/i.test(output)) return attempt(index + 1)
        resolve({ ok: code === 0, output: output.trim(), command: candidate.command })
      })
    }
    attempt(0)
  })
}

function safeRunSegment(value) {
  return String(value || 'requirement').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'requirement'
}

function listFiles(root, current = root, results = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) listFiles(root, absolute, results)
    else results.push(path.relative(root, absolute).replaceAll('\\', '/'))
  }
  return results
}

function splitText(value, size = DOCUMENT_CHUNK_SIZE) {
  const text = String(value || '')
  if (!text) return ['']
  const chunks = []
  let offset = 0
  while (offset < text.length) {
    let end = Math.min(text.length, offset + size)
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('。', end))
      if (boundary > offset + Math.floor(size * 0.55)) end = boundary + 1
    }
    chunks.push(text.slice(offset, end))
    offset = end
  }
  return chunks
}

function extractDocxStructure(sourcePath) {
  const script = path.join(runnerDir, 'extract-docx-bundle.py')
  return runPython([script, sourcePath], runnerDir).then((result) => {
    if (!result.ok) return { error: result.output }
    try { return JSON.parse(result.output) } catch (error) { return { error: error.message } }
  })
}

async function extractDocumentBundle(requirement, sourcePath) {
  const images = []
  let documentHtml = ''
  let docxStructure = null
  const extension = path.extname(sourcePath || requirement.source?.filename || '').toLowerCase()
  if (sourcePath && extension === '.docx' && fs.existsSync(sourcePath)) {
    docxStructure = await extractDocxStructure(sourcePath)
    const result = await mammoth.convertToHtml({ path: sourcePath }, {
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.read('base64')
        const index = images.length + 1
        images.push({ name: `document-image-${index}`, mimeType: image.contentType, data })
        return { src: `document-image-${index}` }
      }),
    })
    documentHtml = result.value
  }
  const combined = [
    `# 平台编辑后的需求原文\n${requirement.source?.text || ''}`,
    docxStructure ? `# DOCX 完整结构（正文顺序、表格、图片占位、批注、页眉页脚、脚注与嵌入附件）\n${json(docxStructure)}` : '',
    documentHtml ? `# DOCX 结构化 HTML（图片以 document-image-N 标记）\n${documentHtml}` : '',
  ].filter(Boolean).join('\n\n')
  return { chunks: splitText(combined), images }
}

function sourceIndexMarkdown(sourceRequirements) {
  return sourceRequirements.map((item) => `- **${item.id}** ${item.text}  \n  来源：${item.source}`).join('\n')
}

function parseJsonText(value) {
  if (value && typeof value === 'object') return structuredClone(value)
  const text = String(value || '').replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new Error('内容不是有效 JSON')
  }
}

function mergePatch(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch)
  const output = target && typeof target === 'object' && !Array.isArray(target) ? structuredClone(target) : {}
  for (const [key, value] of Object.entries(patch)) output[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergePatch(output[key], value) : structuredClone(value)
  return output
}

function requiredSkillResources(rootSkill, resources) {
  const linked = [...String(rootSkill || '').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].replaceAll('\\', '/'))
  return unique(linked.filter((relativePath) => resources.includes(relativePath) && ['.md', '.txt', '.json', '.yaml', '.yml'].includes(path.extname(relativePath).toLowerCase())))
}

function initialAnalysisData(requirement) {
  return {
    meta: { title: requirement.productName, product: requirement.productName, version: requirement.version },
    requirements: [],
    overview: { summary: requirement.summary || '', targetUsers: [], scenarios: [], globalBlockers: [] },
    businessFlow: { swimlane: { phases: [], lanes: [], nodes: [], edges: [], unknownEdges: [] } },
    afLayers: [],
    pageFlow: { lanes: [], pages: [], edges: [], unknownEdges: [], coverage: [] },
    pages: [],
    designReview: { crossPageConstraints: [], pages: [], terminology: [], globalBlockers: [] },
    competitors: { products: PRODUCTS, features: [], evidence: [] },
    knowledgeRetrieval: { knowleddge: { status: 'skipped', reason: '独立 API 环境未接入知识库' }, 'fallback-kb': { status: 'skipped', reason: '独立 API 环境未接入知识库' } },
    coverage: [],
  }
}

function summarizeAnalysisData(data) {
  const businessFlow = data?.businessFlow?.businessFlow || data?.businessFlow || {}
  const swimlane = businessFlow.swimlane || businessFlow.swimlanes || businessFlow
  return {
    pages: Array.isArray(data?.pages) ? data.pages.length : 0,
    flowPages: Array.isArray(data?.pageFlow?.pages) ? data.pageFlow.pages.length : 0,
    flowNodes: Array.isArray(swimlane?.nodes) ? swimlane.nodes.length : 0,
    layers: Array.isArray(data?.afLayers) ? data.afLayers.length : 0,
    reviewPages: Array.isArray(data?.designReview?.pages) ? data.designReview.pages.length : 0,
    competitorFeatures: Array.isArray(data?.competitors?.features) ? data.competitors.features.length : 0,
  }
}

function summarizeAnalysisArtifact(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, bytes: 0, ...summarizeAnalysisData(null) }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      exists: true,
      bytes: fs.statSync(filePath).size,
      ...summarizeAnalysisData(data),
    }
  } catch (error) {
    return { exists: true, bytes: fs.statSync(filePath).size, invalidJson: error.message, pages: 0, flowPages: 0, flowNodes: 0, layers: 0, reviewPages: 0, competitorFeatures: 0 }
  }
}

function analysisSectionValue(section, content) {
  const parsed = parseJsonText(content)
  const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed[section] !== undefined ? parsed[section] : parsed
  if (section !== 'businessFlow' || !value || typeof value !== 'object' || Array.isArray(value) || value.swimlane || value.swimlanes) return value
  return ['phases', 'lanes', 'nodes', 'edges', 'unknownEdges'].some((key) => Array.isArray(value[key])) ? { swimlane: value } : value
}

function wouldLoseAnalysisProgress(current, candidate) {
  const before = summarizeAnalysisData(current)
  const after = summarizeAnalysisData(candidate)
  const fields = ['pages', 'flowPages', 'flowNodes', 'layers', 'reviewPages', 'competitorFeatures']
  const lost = fields.filter((field) => before[field] > 0 && after[field] < before[field])
  return { lost, before, after }
}

function summarizeToolArguments(name, args) {
  if (name === 'read_document_chunk') return { index: args.index }
  if (name === 'read_skill_resource') return { relativePath: args.relativePath }
  if (name === 'write_artifact') return { artifact: args.artifact, contentLength: String(args.content || '').length }
  if (name === 'set_analysis_section') return { section: args.section, contentLength: String(args.content || '').length }
  if (name === 'upsert_analysis_pages') return { contentLength: String(args.pages || '').length }
  if (name === 'patch_analysis_data') return { patchKeys: args.patch && typeof args.patch === 'object' ? Object.keys(args.patch) : [] }
  if (name === 'search_official_docs') return { featureCount: Array.isArray(args.features) ? args.features.length : 0 }
  return { keys: Object.keys(args || {}) }
}

function normalizeEvidence(evidence, featureNames) {
  const mapped = evidence.map((item) => {
    const evidenceStatus = item.evidenceStatus || item.status
    const status = evidenceStatus === 'verified' ? 'verified'
      : evidenceStatus === 'partial' ? 'docs-only'
        : evidenceStatus === 'blocked' ? 'inaccessible'
          : ['verified', 'docs-only', 'login-blocked', 'inaccessible', 'not-found'].includes(evidenceStatus) ? evidenceStatus : 'not-found'
    return { ...item, status, evidenceStatus, accessedAt: item.accessedAt || new Date().toISOString().slice(0, 10) }
  })
  for (const feature of featureNames.length ? featureNames : ['需求同类功能']) {
    mapped.push({ product: '移动云', feature, status: 'not-found', evidenceStatus: 'source-fact', accessedAt: new Date().toISOString().slice(0, 10), blocker: '移动云内容以本次需求原文为事实来源，不作为外部竞品证据。' })
  }
  for (const product of PRODUCTS) {
    if (!mapped.some((item) => item.product === product)) mapped.push({ product, feature: featureNames[0] || '需求同类功能', status: 'not-found', evidenceStatus: 'unverified', accessedAt: new Date().toISOString().slice(0, 10), blocker: '未找到可核验官方资料。' })
  }
  return mapped
}

function runPythonValidator(scriptPath, runDir) {
  return runPython([scriptPath, '--data', path.join(runDir, 'analysis-data.json'), '--html', path.join(runDir, 'requirement-analysis.html'), '--flow', path.join(runDir, 'page_flow_schema.json'), '--coverage', path.join(runDir, 'coverage-ledger.json')], runDir)
}

function collectPendingItems(data) {
  const candidates = [...(data.overview?.globalBlockers || []), ...(data.pages || []).flatMap((page) => page.openQuestions || [])]
  return candidates.map((item) => ({ title: String(item.title || item.question || '待确认项'), description: String(item.description || item.detail || item.decision || ''), sourceHint: Array.isArray(item.sources) ? item.sources.join('、') : String(item.sourceHint || '') })).filter((item) => item.description)
}

function toolDefinitions() {
  return [
    { type: 'function', function: { name: 'list_skill_resources', description: '列出本地 Skill 的全部引用文件、模板、资产和脚本。', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
    { type: 'function', function: { name: 'read_skill_resource', description: '读取一个本地 Skill 文本资源。必须读取 SKILL.md 指定的引用文档。', parameters: { type: 'object', properties: { relativePath: { type: 'string' } }, required: ['relativePath'], additionalProperties: false } } },
    { type: 'function', function: { name: 'read_document_chunk', description: '按编号读取完整需求材料分块。应读取全部分块。', parameters: { type: 'object', properties: { index: { type: 'integer', minimum: 0 } }, required: ['index'], additionalProperties: false } } },
    { type: 'function', function: { name: 'read_previous_analysis', description: '读取上一版结构化解析，用于反馈重解析和页面基线保护。', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
    { type: 'function', function: { name: 'write_artifact', description: '写入完整 Skill 产物。大需求不要一次重写 analysis-data.json，优先使用 set_analysis_section 和 upsert_analysis_pages 分段生成。', parameters: { type: 'object', properties: { artifact: { type: 'string', enum: [...ARTIFACTS] }, content: { type: 'string', description: '完整 JSON 字符串或 Markdown 字符串' } }, required: ['artifact', 'content'], additionalProperties: false } } },
    { type: 'function', function: { name: 'set_analysis_section', description: '将 analysis-data.json 的一个顶层模块整体写入。content 可直接传模块值，也可传带同名键的对象；businessFlow 推荐结构为 {"swimlane":{"phases":[],"lanes":[],"nodes":[],"edges":[],"unknownEdges":[]}}，也兼容直接传 phases/lanes/nodes。', parameters: { type: 'object', properties: { section: { type: 'string', enum: [...ANALYSIS_SECTIONS] }, content: { type: 'string' } }, required: ['section', 'content'], additionalProperties: false } } },
    { type: 'function', function: { name: 'upsert_analysis_pages', description: '向 analysis-data.json 分批新增或更新页面详情，按 id 合并。每次建议写 1-4 个完整页面，避免大需求的一次性输出被截断。pages 必须是 JSON 数组字符串。', parameters: { type: 'object', properties: { pages: { type: 'string' } }, required: ['pages'], additionalProperties: false } } },
    { type: 'function', function: { name: 'patch_analysis_data', description: '按对象递归合并、按数组整体替换的方式定向修复 analysis-data.json。', parameters: { type: 'object', properties: { patch: { type: 'object' } }, required: ['patch'], additionalProperties: false } } },
    { type: 'function', function: { name: 'read_current_artifact', description: '读取当前产物，校验后定向修复时使用。', parameters: { type: 'object', properties: { artifact: { type: 'string', enum: [...ARTIFACTS] } }, required: ['artifact'], additionalProperties: false } } },
    { type: 'function', function: { name: 'search_official_docs', description: '按功能单元检索阿里云、华为云和腾讯云官方文档，返回真实证据或受阻状态。', parameters: { type: 'object', properties: { features: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 4 } }, required: ['features'], additionalProperties: false } } },
    { type: 'function', function: { name: 'validate_bundle', description: '组装本地 HTML 和三份数据产物，执行结构校验及 Skill 自带 Python 校验器。失败后必须根据 errors 修复再调用。', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
  ]
}

async function requestDeepSeek({ baseUrl, apiKey, model, messages, tools, fetcher }) {
  const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.1, max_tokens: 8192 }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error?.message || `DeepSeek Skill Runner 调用失败（${response.status}）`)
  const message = payload.choices?.[0]?.message
  if (!message) throw new Error('DeepSeek Skill Runner 未返回消息')
  return { role: 'assistant', content: message.content || '', ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) }
}

export async function runLocalSkillWithDeepSeek({
  requirement,
  answered = [],
  ignored = [],
  previousAnalysisData,
  dataDir,
  uploadDir,
  skillDir,
  baseUrl,
  model,
  apiKey,
  onProgress,
  fetcher = fetch,
  evidenceCollector = collectOfficialEvidence,
}) {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`
  const runDir = path.join(dataDir, 'analysis-runs', requirement.id, runId)
  fs.mkdirSync(runDir, { recursive: true })
  const sourcePath = requirement.source?.savedPath ? path.join(uploadDir, requirement.source.savedPath) : ''
  const sourceRequirements = indexRequirementSource(requirement.source?.text || '', requirement.source?.filename || 'requirement.md')
  const document = await extractDocumentBundle(requirement, sourcePath)
  const resources = listFiles(skillDir)
  const rootSkill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
  const requiredResources = requiredSkillResources(rootSkill, resources)
  const artifactPath = (name) => path.join(runDir, name)
  const tracePath = artifactPath('runner-events.jsonl')
  const readChunks = new Set()
  const readResources = new Set()
  let artifactRevision = 0
  let lastValidatedRevision = -1
  let lastValidationSignature = ''
  let repeatedValidationCount = 0
  let lastToolResult = null
  const trace = (event) => fs.appendFileSync(tracePath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, 'utf8')
  fs.writeFileSync(artifactPath('run-manifest.json'), json({ runId, requirementId: requirement.id, runner: 'deepseek-tool-loop-v1', skill: path.basename(skillDir), model, sourcePath, documentChunks: document.chunks.length, documentImages: document.images.length, startedAt: new Date().toISOString() }), 'utf8')
  fs.writeFileSync(artifactPath('requirement_source_indexed.md'), sourceIndexMarkdown(sourceRequirements), 'utf8')
  fs.writeFileSync(artifactPath('analysis-data.json'), json(initialAnalysisData(requirement)), 'utf8')
  trace({ type: 'run_started', documentChunks: document.chunks.length, requiredResources, sourceRequirements: sourceRequirements.length })
  let evidenceCache = null
  let evidenceKey = ''
  let finalResult = null

  const progress = (percent, title, detail) => onProgress?.({ status: 'running', percent, title, detail, updatedAt: new Date().toISOString() })
  progress(8, '正在启动本地 Skill Runner', '正在建立独立产物目录并解析完整需求材料。')

  const ensureEvidence = async (data, requestedFeatures) => {
    const features = unique((requestedFeatures?.length ? requestedFeatures : data.competitors?.features?.map((item) => item.name)) || []).slice(0, 4)
    const key = features.join('|')
    if (!evidenceCache || key !== evidenceKey) {
      evidenceCache = features.length ? await evidenceCollector(features.map((name) => ({ name }))) : []
      evidenceKey = key
    }
    return normalizeEvidence(evidenceCache, features)
  }

  const materialize = async () => {
    const dataPath = artifactPath('analysis-data.json')
    if (!fs.existsSync(dataPath)) return { ok: false, errors: ['尚未生成 analysis-data.json'] }
    let raw
    try { raw = JSON.parse(fs.readFileSync(dataPath, 'utf8')) } catch (error) { return { ok: false, errors: [`analysis-data.json 无法解析：${error.message}`] } }
    let data = normalizeSkillContract(raw, sourceRequirements)
    const officialEvidence = await ensureEvidence(data)
    data.competitors = applyOfficialEvidenceToCompetitors(data.competitors, evidenceCache || [])
    data.competitors.evidence = officialEvidence
    data.competitorAnalysis = data.competitors.analysis
    data.meta = { ...data.meta, title: data.meta?.title || requirement.productName, product: requirement.productName, version: requirement.version, skillRunner: 'deepseek-tool-loop-v1', runId }
    const html = renderAnalysisHtml(data)
    fs.writeFileSync(dataPath, json(data), 'utf8')
    fs.writeFileSync(artifactPath('page_flow_schema.json'), json(data.pageFlow), 'utf8')
    fs.writeFileSync(artifactPath('coverage-ledger.json'), json(data.coverage), 'utf8')
    fs.writeFileSync(artifactPath('requirement-analysis.html'), html, 'utf8')
    const contract = validateSkillContract(data, sourceRequirements, { baselinePages: previousAnalysisData?.pages || [] })
    const python = await runPythonValidator(path.join(skillDir, 'scripts', 'validate_analysis_bundle.py'), runDir)
    const errors = [...contract.errors, ...(python.ok ? [] : python.output.split(/\r?\n/).filter((line) => /^FAIL:|^- /.test(line)))]
    if (errors.length) return { ok: false, errors: unique(errors), python: python.output }
    return { ok: true, data, html, validation: { ok: true, sourceRequirementCount: sourceRequirements.length, pageCount: data.pages.length, businessFlowNodeCount: data.businessFlow.swimlane.nodes.length, pageFlowEdgeCount: data.pageFlow.edges.length, afLayerCount: data.afLayers.length, designReviewPageCount: data.designReview.pages.length, competitorFeatureCount: data.competitors.features.length, competitorEvidenceCount: data.competitors.evidence.length, unmappedCount: 0, skillContract: 'designer-requirement-analysis-html' } }
  }

  const executionStatus = () => {
    const artifact = summarizeAnalysisArtifact(artifactPath('analysis-data.json'))
    const missingChunks = document.chunks.map((_, index) => index).filter((index) => !readChunks.has(index))
    const missingResources = requiredResources.filter((relativePath) => !readResources.has(relativePath))
    const missingSections = []
    if (!artifact.pages) missingSections.push('pages')
    if (!artifact.flowNodes) missingSections.push('businessFlow')
    if (artifact.layers !== 6) missingSections.push('afLayers')
    if (!artifact.flowPages) missingSections.push('pageFlow')
    if (!artifact.reviewPages) missingSections.push('designReview')
    if (!artifact.competitorFeatures) missingSections.push('competitors')
    return { artifact, missingChunks, missingResources, missingSections, artifactRevision, repeatedValidationCount }
  }

  const nextStepInstruction = () => {
    const status = executionStatus()
    if (status.missingChunks.length || status.missingResources.length) {
      return `执行前置材料尚未读完。下一轮优先并行调用读取工具：缺少文档分块 ${status.missingChunks.join('、') || '无'}；缺少 Skill 引用 ${status.missingResources.join('、') || '无'}。不要生成结论前跳过这些材料。`
    }
    if (status.missingSections.includes('pages')) return '材料已读取完成。立即使用 upsert_analysis_pages 分批写入全部页面详情（每批 1-4 页），不要继续读取可选资源或反复校验空骨架。'
    if (status.missingSections.length) {
      const swimlaneHint = status.missingSections.includes('businessFlow') ? ' businessFlow 必须包含 swimlane.phases、swimlane.lanes、swimlane.nodes；也可直接把 phases/lanes/nodes 作为该模块内容传入。' : ''
      return `页面详情已有 ${status.artifact.pages} 页。继续补齐这些模块：${status.missingSections.join('、')}。优先使用 set_analysis_section；pageFlow 和 designReview 必须与全部页面一一对应。${swimlaneHint}`
    }
    return '核心模块已写入。现在调用 validate_bundle；若失败，读取当前产物并按 errors 定向修复，不得删减已有页面或原文覆盖。'
  }

  const executeTool = async (name, args) => {
    if (name === 'list_skill_resources') return { resources }
    if (name === 'read_skill_resource') {
      const relativePath = String(args.relativePath || '').replaceAll('\\', '/')
      if (!resources.includes(relativePath)) return { error: '资源不存在', resources }
      const absolute = path.join(skillDir, relativePath)
      const extension = path.extname(relativePath).toLowerCase()
      if (!['.md', '.json', '.yaml', '.yml', '.py', '.txt'].includes(extension)) return { relativePath, binary: true, size: fs.statSync(absolute).size, note: '二进制资源已由执行器保留；如为图片，请参考 Skill 文字说明和随任务附带的视觉输入。' }
      readResources.add(relativePath)
      return { relativePath, content: fs.readFileSync(absolute, 'utf8') }
    }
    if (name === 'read_document_chunk') {
      const index = Number(args.index)
      if (index >= 0 && index < document.chunks.length) readChunks.add(index)
      return index >= 0 && index < document.chunks.length ? { index, total: document.chunks.length, content: document.chunks[index] } : { error: `分块不存在，可用范围 0-${document.chunks.length - 1}` }
    }
    if (name === 'read_previous_analysis') return previousAnalysisData ? { analysis: previousAnalysisData } : { analysis: null, note: '首次解析，没有上一版。' }
    if (name === 'write_artifact') {
      if (!ARTIFACTS.has(args.artifact)) return { error: '不允许写入该产物' }
      const target = artifactPath(args.artifact)
      if (args.artifact.endsWith('.json')) {
        const candidate = parseJsonText(args.content)
        if (args.artifact === 'analysis-data.json' && fs.existsSync(target)) {
          const current = JSON.parse(fs.readFileSync(target, 'utf8'))
          const progressLoss = wouldLoseAnalysisProgress(current, candidate)
          if (progressLoss.lost.length) return { ok: false, error: `拒绝覆盖：新产物会丢失 ${progressLoss.lost.join('、')}。请使用 set_analysis_section、upsert_analysis_pages 或 patch_analysis_data 定向修改。`, ...progressLoss }
        }
        fs.writeFileSync(target, json(candidate), 'utf8')
      } else fs.writeFileSync(target, String(args.content || ''), 'utf8')
      if (args.artifact === 'analysis-data.json') artifactRevision += 1
      if (args.artifact === 'analysis-data.json') progress(62, '本地 Skill 已生成结构化分析', '正在补充官方证据并执行本地完整度校验。')
      return { ok: true, artifact: args.artifact, bytes: fs.statSync(target).size }
    }
    if (name === 'set_analysis_section') {
      if (!ANALYSIS_SECTIONS.has(args.section)) return { error: '不允许写入该分析模块' }
      const target = artifactPath('analysis-data.json')
      const current = JSON.parse(fs.readFileSync(target, 'utf8'))
      current[args.section] = analysisSectionValue(args.section, args.content)
      fs.writeFileSync(target, json(current), 'utf8')
      artifactRevision += 1
      return { ok: true, artifact: 'analysis-data.json', section: args.section, bytes: fs.statSync(target).size, status: executionStatus() }
    }
    if (name === 'upsert_analysis_pages') {
      const incoming = parseJsonText(args.pages)
      if (!Array.isArray(incoming) || !incoming.length) return { error: 'pages 必须是非空 JSON 数组' }
      const target = artifactPath('analysis-data.json')
      const current = JSON.parse(fs.readFileSync(target, 'utf8'))
      const pages = Array.isArray(current.pages) ? current.pages : []
      const positions = new Map(pages.map((page, index) => [page?.id, index]).filter(([id]) => id))
      for (const page of incoming) {
        if (!page || typeof page !== 'object' || !page.id) return { error: '每个页面必须包含稳定 id' }
        const position = positions.get(page.id)
        if (position === undefined) {
          positions.set(page.id, pages.length)
          pages.push(page)
        } else pages[position] = mergePatch(pages[position], page)
      }
      current.pages = pages
      fs.writeFileSync(target, json(current), 'utf8')
      artifactRevision += 1
      progress(62, '本地 Skill 正在生成页面详情', `已分批写入 ${pages.length} 个页面，继续补齐流程、设计要点和竞品分析。`)
      return { ok: true, artifact: 'analysis-data.json', received: incoming.length, totalPages: pages.length, bytes: fs.statSync(target).size, status: executionStatus() }
    }
    if (name === 'patch_analysis_data') {
      const target = artifactPath('analysis-data.json')
      if (!fs.existsSync(target)) return { error: 'analysis-data.json 尚未生成' }
      const current = JSON.parse(fs.readFileSync(target, 'utf8'))
      fs.writeFileSync(target, json(mergePatch(current, args.patch)), 'utf8')
      artifactRevision += 1
      return { ok: true, artifact: 'analysis-data.json', bytes: fs.statSync(target).size }
    }
    if (name === 'read_current_artifact') {
      if (!ARTIFACTS.has(args.artifact)) return { error: '不允许读取该产物' }
      const target = artifactPath(args.artifact)
      return fs.existsSync(target) ? { artifact: args.artifact, content: fs.readFileSync(target, 'utf8') } : { error: '产物尚未生成' }
    }
    if (name === 'search_official_docs') {
      progress(74, '正在检索竞品官方资料', '仅使用阿里云、华为云和腾讯云官方站点，保留受阻与未找到状态。')
      const evidence = await ensureEvidence({ competitors: { features: [] } }, args.features)
      return { evidence }
    }
    if (name === 'validate_bundle') {
      const status = executionStatus()
      if (status.missingChunks.length || status.missingResources.length) {
        return { ok: false, errors: [`尚未读取全部执行材料：文档分块 ${status.missingChunks.join('、') || '已读完'}；Skill 引用 ${status.missingResources.join('、') || '已读完'}`], instruction: nextStepInstruction() }
      }
      progress(88, '正在执行本地 Skill 校验', '正在核对原文覆盖、页面一致性、A-F、竞品证据和 HTML 合同。')
      const result = await materialize()
      if (result.ok) finalResult = result
      if (!result.ok) {
        const signature = result.errors.join('|')
        repeatedValidationCount = signature === lastValidationSignature && lastValidatedRevision === artifactRevision ? repeatedValidationCount + 1 : 0
        lastValidationSignature = signature
        lastValidatedRevision = artifactRevision
      }
      return result.ok ? { ok: true, summary: result.validation } : { ok: false, errors: result.errors, repeatedWithoutChanges: repeatedValidationCount, instruction: repeatedValidationCount ? `校验错误没有变化，禁止再次直接校验。${nextStepInstruction()}` : `请按 errors 定向修复。${nextStepInstruction()}` }
    }
    return { error: `未知工具：${name}` }
  }

  const tools = toolDefinitions()
  const userContent = [{ type: 'text', text: `执行本地 Skill 完整解析。产品：${requirement.productName}；版本：${requirement.version}。需求材料共 ${document.chunks.length} 个分块，必须通过 read_document_chunk 全部读取。已确认答复：${json(answered.map((item) => ({ title: item.title, answer: item.answer })))}。已忽略项：${json(ignored.map((item) => item.title))}。必须读取 SKILL.md 指定的引用文档。执行器已创建 analysis-data.json 空骨架：大需求应使用 upsert_analysis_pages 每批写 1-4 个完整页面，并用 set_analysis_section 分别写入业务泳道、A-F、页面流程、设计要点和竞品功能，避免一次输出被截断。必须调用 search_official_docs 和 validate_bundle；校验未通过时在同一会话中修复，禁止提前结束。` }]
  for (const image of document.images.slice(0, 8)) userContent.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } })
  const swimlaneAsset = path.join(skillDir, 'assets', 'example-swimlane.png')
  if (fs.existsSync(swimlaneAsset)) userContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(swimlaneAsset).toString('base64')}` } })
  const messages = [
    { role: 'system', content: `你是通用本地 Skill 执行代理。根 Skill 如下：\n${rootSkill}\n\n你必须通过工具读取引用资源和完整需求，逐步写入产物并调用本地校验。允许在一次回复中并行调用多个读取或写入工具。原文是唯一业务事实。页面详情是第一优先产物；不得只写概述和覆盖台账。禁止在未调用 validate_bundle 或校验失败时宣称完成。不要在普通回复中粘贴最终 JSON。` },
    { role: 'user', content: userContent },
  ]

  let imagesRemoved = false
  let lastExecutionSignature = ''
  let stalledTurns = 0
  for (let turn = 0; turn < MAX_TURNS && !finalResult; turn += 1) {
    progress(Math.min(55, 14 + turn * 3), '正在执行本地 Skill', `多轮工具执行第 ${turn + 1} 轮：读取材料、生成产物或修复校验问题。`)
    trace({ type: 'turn_started', turn: turn + 1, status: executionStatus() })
    let assistant
    try {
      assistant = await requestDeepSeek({ baseUrl, apiKey, model, messages, tools, fetcher })
    } catch (error) {
      const initialUser = messages[1]
      const containsImages = Array.isArray(initialUser.content) && initialUser.content.some((item) => item.type === 'image_url')
      if (containsImages && !imagesRemoved) {
        initialUser.content = initialUser.content.filter((item) => item.type !== 'image_url')
        initialUser.content.push({ type: 'text', text: `当前模型接口无法接收图片。文档中共有 ${document.images.length} 张图片，图片内容必须标记为未识别并进入待确认项，不得猜测。` })
        imagesRemoved = true
        assistant = await requestDeepSeek({ baseUrl, apiKey, model, messages, tools, fetcher })
      } else throw error
    }
    messages.push(assistant)
    trace({ type: 'assistant_message', turn: turn + 1, toolNames: (assistant.tool_calls || []).map((call) => call.function?.name), contentLength: assistant.content?.length || 0 })
    if (assistant.tool_calls?.length) {
      for (const call of assistant.tool_calls) {
        let args = {}
        try { args = JSON.parse(call.function?.arguments || '{}') } catch { args = {} }
        let result
        try { result = await executeTool(call.function?.name, args) } catch (error) { result = { error: error.message } }
        lastToolResult = result
        trace({ type: 'tool_result', turn: turn + 1, tool: call.function?.name, arguments: summarizeToolArguments(call.function?.name, args), ok: result?.ok, error: result?.error, errors: result?.errors, artifact: summarizeAnalysisArtifact(artifactPath('analysis-data.json')) })
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
      }
      const status = executionStatus()
      const signature = JSON.stringify({ readChunks: readChunks.size, readResources: readResources.size, artifactRevision, artifact: status.artifact, final: Boolean(finalResult) })
      stalledTurns = signature === lastExecutionSignature ? stalledTurns + 1 : 0
      lastExecutionSignature = signature
      if (!finalResult && (lastToolResult?.ok === false || stalledTurns >= 2 || (!status.missingChunks.length && !status.missingResources.length && status.missingSections.length))) {
        const reason = stalledTurns >= 2 ? '连续两轮没有产生新的读取或产物进展。' : ''
        const instruction = `${reason}${nextStepInstruction()}`
        messages.push({ role: 'user', content: instruction })
        trace({ type: 'runner_instruction', turn: turn + 1, stalledTurns, instruction })
      }
      continue
    }
    if (assistant.content) {
      try {
        const candidate = parseJsonText(assistant.content)
        fs.writeFileSync(artifactPath('analysis-data.json'), json(candidate), 'utf8')
        artifactRevision += 1
        messages.push({ role: 'user', content: '已将你返回的 JSON 保存为 analysis-data.json。现在必须调用 validate_bundle，并根据错误继续修复。' })
      } catch {
        messages.push({ role: 'user', content: '任务尚未通过本地校验。请继续使用工具读取、写入或修复产物，然后调用 validate_bundle。' })
      }
    }
  }

  if (!finalResult) finalResult = await materialize()
  if (!finalResult.ok) {
    const failure = { status: 'failed', completedAt: new Date().toISOString(), errors: finalResult.errors, executionStatus: executionStatus() }
    fs.writeFileSync(artifactPath('run-manifest.json'), json({ ...JSON.parse(fs.readFileSync(artifactPath('run-manifest.json'), 'utf8')), ...failure }), 'utf8')
    trace({ type: 'run_failed', ...failure })
    throw new Error(`本地 Skill Runner 在 ${MAX_TURNS} 轮内未通过校验：${finalResult.errors.join('；')}`)
  }
  fs.writeFileSync(artifactPath('run-manifest.json'), json({ ...JSON.parse(fs.readFileSync(artifactPath('run-manifest.json'), 'utf8')), status: 'completed', completedAt: new Date().toISOString(), validation: finalResult.validation }), 'utf8')
  progress(100, '本地 Skill 解析已完成', '五件套产物已生成，并通过结构校验和 Skill 自带校验器。')
  return {
    summary: finalResult.data.overview.summary || requirement.summary,
    html: finalResult.html,
    analysisData: finalResult.data,
    pendingItems: collectPendingItems(finalResult.data),
    pipelineMode: 'deepseek-skill-runner',
    pipelineSkill: 'designer-requirement-analysis-html-tool-loop-v1',
    validation: finalResult.validation,
    runId,
    artifactPath: path.relative(dataDir, artifactPath('requirement-analysis.html')).replaceAll('\\', '/'),
  }
}
