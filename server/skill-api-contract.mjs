export const OFFICIAL_COMPETITOR_DOMAINS = ['aliyun.com', 'huaweicloud.com', 'cloud.tencent.com']

const PRODUCTS = ['移动云', '阿里云', '华为云', '腾讯云']
const LAYERS = ['A 上游数据层', 'B 管控规则层', 'C 业务规则层', 'D 申请/发起层', 'E 校验/审核层', 'F 执行/输出层']
const SEARCH_ENDPOINTS = {
  'aliyun.com': (query) => `https://www.aliyun.com/search?keyword=${encodeURIComponent(query)}`,
  'huaweicloud.com': (query) => `https://support.huaweicloud.com/search?keyword=${encodeURIComponent(query)}`,
  'cloud.tencent.com': (query) => `https://cloud.tencent.com/search?query=${encodeURIComponent(query)}`,
}
const OFFICIAL_SEED_URLS = {
  'aliyun.com': ['https://help.aliyun.com/zh/internet-shared-bandwidth/'],
  'huaweicloud.com': ['https://support.huaweicloud.com/usermanual-eip/eip_0001.html'],
  'cloud.tencent.com': ['https://cloud.tencent.com/document/product/684'],
}
const FLOW_LOG_SEED_URLS = {
  'aliyun.com': [
    'https://help.aliyun.com/zh/vpc/vpc-flow-logs',
    'https://help.aliyun.com/zh/vpc/developer-reference/api-vpc-2016-04-28-createflowlog',
    'https://help.aliyun.com/zh/vpc/developer-reference/api-vpc-2016-04-28-deleteflowlog',
    'https://help.aliyun.com/zh/sls/developer-reference/api-sls-2020-12-30-getlogsv2',
  ],
  'huaweicloud.com': [
    'https://support.huaweicloud.com/usermanual-vpc/FlowLog_0002.html',
    'https://support.huaweicloud.com/usermanual-vpc/FlowLog_0003.html',
    'https://support.huaweicloud.com/usermanual-vpc/FlowLog_0004.html',
    'https://support.huaweicloud.com/usermanual-vpc/FlowLog_0005.html',
  ],
  'cloud.tencent.com': ['https://cloud.tencent.com/document/product/215/35012'],
}

const asArray = (value) => Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value]
const asText = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') return value.trim() || fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean).join('；') || fallback
  return value.title || value.name || value.text || value.description || value.question || fallback
}
const slug = (value, fallback) => String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || fallback
const unique = (values) => [...new Set(values.filter(Boolean))]
const productForDomain = (domain) => domain === 'aliyun.com' ? '阿里云' : domain === 'huaweicloud.com' ? '华为云' : '腾讯云'

function isOfficialUrl(url, expectedDomain) {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === expectedDomain || hostname.endsWith(`.${expectedDomain}`)
  } catch {
    return false
  }
}

function isOfficialDocumentUrl(url, expectedDomain) {
  if (!isOfficialUrl(url, expectedDomain)) return false
  const parsed = new URL(url)
  if (parsed.pathname === '/' || /(^|\/)(search|query)(\/|$)/i.test(parsed.pathname) || /^(search|query)\./i.test(parsed.hostname)) return false
  return /(^|\.)(help|support|docs?)\./i.test(parsed.hostname) || /\/(document|docs?|help|support|product|zh)\//i.test(parsed.pathname)
}

const normalizeEvidenceText = (value) => String(value || '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/\s+/g, '')
  .toLowerCase()

function featureEvidenceProfile(query) {
  const normalized = normalizeEvidenceText(query)
  const productTerms = []
  if (/带宽池|共享带宽|带宽共享/.test(normalized)) productTerms.push('共享带宽', '共享带宽包', '带宽池', '弹性公网ip', 'eip')
  if (/流日志|flowlog/.test(normalized)) productTerms.push('流日志', 'flowlog', 'vpcflowlog')
  if (/公网ip|eip/.test(normalized)) productTerms.push('弹性公网ip', '公网ip', 'eip')
  const intentGroups = []
  if (/批量/.test(normalized)) intentGroups.push(['批量', '多个实例', '多实例'])
  if (/续订|续费|renew/.test(normalized)) intentGroups.push(['续订', '续费', 'renew'])
  if (/创建|新建/.test(normalized)) intentGroups.push(['创建', '新建'])
  if (/查看|查询|检索|搜索/.test(normalized)) intentGroups.push(['查看', '查询', '检索', '搜索'])
  if (/配额|限制|限额/.test(normalized)) intentGroups.push(['配额', '限制', '限额'])
  if (/删除|退订|释放/.test(normalized)) intentGroups.push(['删除', '退订', '释放'])
  if (/移入|加入|添加/.test(normalized)) intentGroups.push(['移入', '加入', '添加'])
  if (/移出|移除/.test(normalized)) intentGroups.push(['移出', '移除'])
  return { productTerms: unique(productTerms.map(normalizeEvidenceText)), intentGroups: intentGroups.map((group) => group.map(normalizeEvidenceText)) }
}

export function classifyOfficialDocumentRelevance(title, excerpt, query) {
  const content = normalizeEvidenceText(`${title} ${excerpt}`)
  const { productTerms, intentGroups } = featureEvidenceProfile(query)
  const matchedProductTerms = productTerms.filter((term) => content.includes(term))
  const matchedIntentGroups = intentGroups.filter((group) => group.some((term) => content.includes(term)))
  const missingIntentGroups = intentGroups.filter((group) => !group.some((term) => content.includes(term)))
  const productMatched = productTerms.length ? matchedProductTerms.length > 0 : normalizeEvidenceText(title).includes(normalizeEvidenceText(query))
  const intentPositions = intentGroups.map((group) => group.flatMap((term) => {
    const positions = []
    let index = content.indexOf(term)
    while (index >= 0) {
      positions.push(index)
      index = content.indexOf(term, index + term.length)
    }
    return positions
  }))
  const intentClusterMatched = !intentGroups.length || (!missingIntentGroups.length && intentPositions[0].some((start) => {
    const nearest = intentPositions.slice(1).map((positions) => Math.min(...positions.map((position) => Math.abs(position - start))))
    return nearest.every((distance) => distance <= 120)
  }))
  const evidenceStatus = productMatched && intentClusterMatched ? 'verified' : productMatched ? 'partial' : 'unverified'
  const missingIntentTerms = missingIntentGroups.map((group) => group[0])
  if (intentGroups.length > 1 && !missingIntentGroups.length && !intentClusterMatched) missingIntentTerms.push(`${intentGroups.map((group) => group[0]).join(' + ')}（未在同一功能语境出现）`)
  return { evidenceStatus, matchedProductTerms, matchedIntentGroups: matchedIntentGroups.flat(), missingIntentTerms }
}

function seedUrlsForFeature(domain, query) {
  if (/流日志|flow\s*log/i.test(query)) return FLOW_LOG_SEED_URLS[domain] || []
  return /带宽池|共享带宽|带宽共享|公网ip|eip/i.test(query) ? OFFICIAL_SEED_URLS[domain] || [] : []
}

function stripHtml(value) {
  return String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;|&#34;/gi, '"').replace(/\s+/g, ' ').trim()
}

function officialLinksFromHtml(html, baseUrl, domain) {
  const links = []
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], baseUrl).href
      if (isOfficialDocumentUrl(url, domain)) links.push({ url, label: stripHtml(match[2]) })
    } catch {}
  }
  return links
}

function candidateScore(candidate, query) {
  const relevance = classifyOfficialDocumentRelevance(candidate.label, '', query)
  return relevance.evidenceStatus === 'verified' ? 3 : relevance.evidenceStatus === 'partial' ? 1 : 0
}

async function fetchOfficialDocument(url, domain, query, fetcher) {
  try {
    const response = await fetcher(url, { headers: { 'User-Agent': 'Mozilla/5.0 Design-Intelligence-Platform/1.0' }, signal: AbortSignal.timeout(8_000) })
    if (!response.ok) return null
    const html = await response.text()
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
    const excerpt = stripHtml(html).slice(0, 2400)
    const relevance = classifyOfficialDocumentRelevance(title, excerpt, query)
    return { url, title, excerpt, relevance, links: officialLinksFromHtml(html, url, domain) }
  } catch {
    return null
  }
}

export async function collectOfficialEvidence(features, fetcher = fetch) {
  const queries = unique(asArray(features).map((item) => asText(item?.name || item?.title || item))).slice(0, 4)
  const tasks = Object.entries(SEARCH_ENDPOINTS).flatMap(([domain, search]) => queries.map(async (query) => {
    const product = productForDomain(domain)
    const accessedAt = new Date().toISOString().slice(0, 10)
    let searchHtml = ''
    let searchBlocked = false
    try {
      const response = await fetcher(search(query), { headers: { 'User-Agent': 'Mozilla/5.0 Design-Intelligence-Platform/1.0' }, signal: AbortSignal.timeout(8_000) })
      searchBlocked = !response.ok
      if (response.ok) searchHtml = await response.text()
    } catch {
      searchBlocked = true
    }
    const searchLinks = officialLinksFromHtml(searchHtml, `https://${domain}`, domain)
    const initialCandidates = unique([...seedUrlsForFeature(domain, query), ...searchLinks.map((item) => item.url)]).slice(0, 4)
    const initialDocuments = (await Promise.all(initialCandidates.map((url) => fetchOfficialDocument(url, domain, query, fetcher)))).filter(Boolean)
    const childCandidates = initialDocuments.flatMap((document) => document.links)
      .map((candidate) => ({ ...candidate, score: candidateScore(candidate, query) }))
      .filter((candidate) => candidate.score > 0 && !initialCandidates.includes(candidate.url))
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
    const childDocuments = (await Promise.all(childCandidates.map((candidate) => fetchOfficialDocument(candidate.url, domain, query, fetcher)))).filter(Boolean)
    const relevantDocuments = [...initialDocuments, ...childDocuments]
      .filter((document) => document.relevance.evidenceStatus !== 'unverified')
      .sort((left, right) => (right.relevance.evidenceStatus === 'verified' ? 2 : 1) - (left.relevance.evidenceStatus === 'verified' ? 2 : 1))
      .slice(0, 2)
    if (relevantDocuments.length) return relevantDocuments.map((document) => ({
      product,
      feature: query,
      url: document.url,
      title: document.title,
      excerpt: document.excerpt,
      accessedAt,
      evidenceStatus: document.relevance.evidenceStatus,
      observation: document.relevance.evidenceStatus === 'verified' ? '正文直接覆盖当前功能及关键操作' : `正文仅支持产品或资源映射，未直接覆盖：${document.relevance.missingIntentTerms.join('、') || '当前功能细节'}`,
      matchedTerms: unique([...document.relevance.matchedProductTerms, ...document.relevance.matchedIntentGroups]),
      missingTerms: document.relevance.missingIntentTerms,
      sourceType: 'official-doc',
    }))
    return [{ product, feature: query, url: '', accessedAt, evidenceStatus: searchBlocked ? 'blocked' : 'unverified', blocker: searchBlocked ? '官方站点搜索或文档访问受阻' : '未找到能够直接或部分支持当前功能的官方文档' }]
  }))
  return (await Promise.all(tasks)).flat().map((item, index) => ({ id: `E${String(index + 1).padStart(3, '0')}`, ...item }))
}

export function indexRequirementSource(text, filename = 'requirement.md') {
  return String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean)
    .map((line, index) => ({ id: `R${String(index + 1).padStart(3, '0')}`, text: line, source: `${filename}#L${index + 1}` }))
}

export const REQUIREMENT_MODULE_CONTRACT = `你是 designer-requirement-analysis-html Skill 的第一模块执行器。只返回有效 JSON，不要 Markdown。
事实唯一来源是输入的 Rxxx 原文；不得遗漏、合并掉条件/例外/数字，不得虚构页面、规则或状态。未知内容进入 openQuestions 或 unknownEdges，并标 design_inference。
返回根对象必须包含 meta、requirements、overview、businessFlow、afLayers、pageFlow、pages、coverage。
overview: {summary,targetUsers:string[],scenarios:string[],pageCount,globalBlockers:[{title,decision,impact,consequence,sources}]}，globalBlockers 最多5条。
businessFlow.swimlane: {phases:[{id,title,order}],lanes:[{id,title,kind,order}],nodes:[{id,lane,phase,title,subtitle,pageId,systemAction,origin,sources}],edges:[{from,to,kind,label,sources}],unknownEdges:[]}。泳道必须是参与角色/系统，不能是页面。
afLayers 必须恰好六层：A上游数据、B管控规则、C业务规则、D申请发起、E校验审核、F执行输出；每层含 layer,responsibility,keyFunctions[],dataSources[],sources[]，不得写“待补充分析”占位。
pageFlow: {lanes:[{id,title}],pages:[{id,lane,title,businessDomain,modules,origin,sources}],edges:[{from,fromModule,to,trigger,label,sources}],unknownEdges,coverage}。
pages 必须覆盖全部页面，每页：id,name,origin(source_fact|design_required),module,path,pageType,preconditions[],openQuestions[],fields[{name,type,required,defaultValue,description,constraints,sources}],interactionRules[],steps[],feedback{success,failure,async,partial},designPoints[],designRisks[],sources[]。
页面详情必须保持“页面上下文、核心规格与交互、结果与设计核对”所需全部信息。coverage 对每个 Rxxx 恰好一条 covered|uncertain|missing；missing 必须为0，uncertain 必须有对应待确认项。`

export const DESIGN_REVIEW_MODULE_CONTRACT = `你是 designer-requirement-analysis-html Skill 的第二模块执行器。只返回有效 JSON，不要 Markdown。
基于输入的 Rxxx 原文和第一模块 JSON 输出 designReview，不得改写需求事实，不重复 overview.globalBlockers。
返回 {designReview:{crossPageConstraints:[{rule,impactPages,design,sources}]最多6条,pages:[{pageId,items:[{type:design_point|risk|protection,fact,impact,advice,priority,sources}]}],terminology:[{term,definition,inconsistencies,sources}],globalBlockers:[]}}。
pages 必须与第一模块全部页面一一对应；每页必须完整汇总该页已有 designPoints、designRisks，并补齐明确可追溯的保护建议，不能只返回 covered/status。事实、风险和建议分开写。`

export const COMPETITOR_MODULE_CONTRACT = `你是 designer-requirement-analysis-html Skill 内部的 research-requirement-competitors 第三模块执行器。只返回有效 JSON，不要 Markdown。
本品固定移动云，竞品固定阿里云、华为云、腾讯云。输入包含完整 Rxxx 原文、需求解析 JSON，以及程序检索到的官方证据。必须区分需求事实、竞品事实、设计启示，禁止使用模型记忆补全竞品事实。
返回 {competitorAnalysis:{scope,scopeSourceRefs,competitors:[移动云,阿里云,华为云,腾讯云],matrix:[{dimension,mobileCloud,alibabaCloud,huaweiCloud,tencentCloud,designTakeaway,evidenceRefs,sourceRefs}],featureEvidence:[{feature,sourceRefs,products:[{product,entryAndPage,structureAndValidation,flowAndFeedback,riskProtection,relevance,evidenceRefs,status}]}],evidence:[{id,product,feature,url,title,accessedAt,evidenceStatus,observation}],blockedSources:[]}}。
matrix 必须覆盖：入口与导航、页面结构与信息层级、页面载体、字段/默认值/必填/校验、主流程与返回回退、成功失败异步状态反馈、配额地域权限版本和关联资源限制、高风险操作保护、列表详情选择器多入口一致性、需求直接相关的特色能力与缺口。可按功能单元细分，但不能只写泛化总结。
移动云列只写本次 Rxxx 需求事实或“需求未定义”；竞品列只写 evidenceRefs 能支持的事实，没有可靠证据写“当前证据未覆盖”，并说明缺口。每条可验证事实必须关联 URL、访问日期和证据状态。设计启示只能写可参考模式及原因，不得写成移动云既定规则。`

export const COMPETITOR_EVIDENCE_CONTRACT = `你是 research-requirement-competitors 的官方证据归纳器。只返回有效 JSON，不要 Markdown。仅根据输入的 Rxxx、需求解析 JSON和官方文档证据生成 COMPETITOR_MODULE_CONTRACT 规定的 competitorAnalysis；不得修改、删除或伪造 evidence。verified 可支持直接事实；partial 只能陈述证据明确覆盖的局部事实并说明边界；blocked/inaccessible/not-found 必须进入 blockedSources。禁止输出“已核验：官方文档包含用户指南”一类无设计价值的机械摘要。`

export const REPAIR_CONTRACT = `你是 Skill 合同修复器。只返回完整有效 JSON，不要 Markdown。根据输入的验证错误修复现有 JSON；保留全部 Rxxx 和已经正确的事实，禁止缩减页面、字段、流程、风险或覆盖项，禁止虚构竞品证据。`

export const API_SKILL_CONTRACT = `${REQUIREMENT_MODULE_CONTRACT}\n${DESIGN_REVIEW_MODULE_CONTRACT}\n${COMPETITOR_MODULE_CONTRACT}`

function normalizeQuestion(value) {
  if (typeof value === 'string') return { title: value, question: value, description: value, decision: value, impact: '相关页面与操作', consequence: '无法完成设计定稿', sources: [] }
  return {
    ...value,
    title: asText(value?.title || value?.question || value?.description, '待确认项'),
    question: asText(value?.question || value?.title || value?.description, '待确认项'),
    description: asText(value?.description || value?.detail || value?.question || value?.title, '需要产品确认'),
    decision: asText(value?.decision || value?.description || value?.question, '需要产品确认'),
    impact: asText(value?.impact, '相关页面与操作'),
    consequence: asText(value?.consequence, '无法完成设计定稿'),
    sources: asArray(value?.sources || value?.sourceIds),
  }
}

function normalizeReviewItem(value, type, sources = []) {
  if (typeof value === 'string') return { type, fact: value, impact: '影响当前页面的理解、操作或反馈', advice: type === 'risk' ? '提供明确校验、反馈与恢复路径' : '按需求事实保持信息和状态一致', priority: type === 'risk' ? 'P1' : 'P2', sources }
  return {
    ...value,
    type: value?.type || type,
    fact: asText(value?.fact || value?.title || value?.description || value?.text || value?.designPoint || value?.risk || value?.point, '上游未总结相关内容'),
    impact: asText(value?.impact, '影响当前页面的理解、操作或反馈'),
    advice: asText(value?.advice || value?.protection || value?.design || value?.recommendation || value?.designAdvice, type === 'risk' ? '提供明确校验、反馈与恢复路径' : '按需求事实保持一致'),
    priority: asText(value?.priority, type === 'risk' ? 'P1' : 'P2'),
    sources: asArray(value?.sources).length ? asArray(value.sources) : sources,
  }
}

function normalizePage(page, index) {
  const id = asText(page?.id, `page-${index + 1}`)
  const pageSources = asArray(page?.sources)
  const name = asText(page?.name || page?.title, `页面 ${index + 1}`)
  const origin = page?.origin === 'source_fact' ? 'source_fact' : 'design_required'
  const fields = asArray(page?.fields || page?.configurationFields || page?.fieldTable).map((field, fieldIndex) => typeof field === 'string'
    ? { name: field, type: '原文未定义', required: '原文未定义', defaultValue: '原文未定义', description: field, constraints: '原文未定义', sources: pageSources }
    : { ...field, name: asText(field?.name, `字段 ${fieldIndex + 1}`), type: asText(field?.type, '原文未定义'), required: asText(field?.required, '原文未定义'), defaultValue: asText(field?.defaultValue ?? field?.default, '原文未定义'), description: asText(field?.description || field?.meaning, '原文未定义'), constraints: asText(field?.constraints || field?.limit, '原文未定义'), sources: asArray(field?.sources).length ? asArray(field.sources) : pageSources })
  const interactionRules = asArray(page?.interactionRules || page?.interactions || page?.rules)
  const openQuestions = asArray(page?.openQuestions || page?.pendingItems || page?.pendingQuestions).map(normalizeQuestion)
  if (origin === 'design_required' && !fields.length && !interactionRules.length && !openQuestions.length) {
    openQuestions.push(normalizeQuestion({
      title: `${name}的页面规格待确认`,
      description: '该页面属于设计必需补充，原文未定义字段、交互规则和具体承载方式。',
      impact: name,
      consequence: '页面结构与交互方案无法依据需求事实定稿。',
      sources: pageSources,
    }))
  }
  return {
    ...page,
    id,
    name,
    origin,
    module: asText(page?.module || page?.businessDomain, '未明确模块'),
    path: asText(page?.path, '原文未定义'),
    pageType: asText(page?.pageType || page?.type, '原文未定义'),
    preconditions: asArray(page?.preconditions),
    openQuestions,
    fields,
    interactionRules,
    steps: asArray(page?.steps || page?.operationFlow || page?.process),
    feedback: {
      success: asText(page?.feedback?.success, '原文未定义'),
      failure: asText(page?.feedback?.failure, '原文未定义'),
      async: asText(page?.feedback?.async, '原文未定义'),
      partial: asText(page?.feedback?.partial, '原文未定义'),
    },
    designPoints: asArray(page?.designPoints || page?.designReview?.points).map((item) => normalizeReviewItem(item, 'design_point', pageSources)),
    designRisks: asArray(page?.designRisks || page?.designReview?.risks).map((item) => normalizeReviewItem(item, 'risk', pageSources)),
    sources: pageSources,
  }
}

function fallbackLayer(layer, pages, sourceRequirements) {
  const rules = pages.flatMap((page) => page.interactionRules.map(asText))
  const steps = pages.flatMap((page) => page.steps.map(asText))
  const fields = unique(pages.flatMap((page) => page.fields.map((field) => field.name))).slice(0, 10)
  const feedback = unique(pages.flatMap((page) => Object.values(page.feedback).map(asText))).slice(0, 8)
  const definitions = {
    'A 上游数据层': ['提供页面展示和业务判断所需的资源、配置与关联数据', fields, unique(pages.map((page) => page.module))],
    'B 管控规则层': ['统一承载权限、配额、数量和状态限制', rules.filter((item) => /权限|配额|限制|最多|禁止|禁用/.test(item)), ['用户权限、资源配额、资源状态']],
    'C 业务规则层': ['定义核心对象关系、可操作条件和业务约束', rules, ['需求规则、对象关联关系']],
    'D 申请/发起层': ['承载用户从页面入口发起创建、修改、移入、移出或删除操作', steps.filter((item) => /用户|点击|选择|填写|提交|确认/.test(item)), ['用户输入、页面选择']],
    'E 校验/审核层': ['在提交和执行前完成合法性、权限和影响范围校验', rules.filter((item) => /校验|条件|权限|失败|禁用|不可/.test(item)), ['页面输入、权限服务、配额与状态数据']],
    'F 执行/输出层': ['执行变更并向用户输出成功、失败、异步或部分成功结果', feedback, ['后台执行结果、页面状态与反馈']],
  }
  const [responsibility, keyFunctions, dataSources] = definitions[layer]
  return { layer, responsibility: `${responsibility}（由需求页面信息归纳）`, keyFunctions: keyFunctions.length ? keyFunctions : ['原文未形成可执行明细，需作为待确认项核对'], dataSources, sources: sourceRequirements.slice(0, 8).map((item) => item.id), origin: 'design_inference' }
}

function normalizeCompetitors(input) {
  if (Array.isArray(input)) {
    const featureCount = Math.max(1, ...input.map((item) => asArray(item.features).length))
    const features = Array.from({ length: featureCount }, (_, index) => {
      const mobile = input.find((item) => item.product === '移动云')
      const name = asText(asArray(mobile?.features)[index], `同类功能 ${index + 1}`).replace(/[？?]$/, '')
      return {
        name,
        matrix: PRODUCTS.map((product) => {
          const row = input.find((item) => item.product === product) || {}
          const feature = asText(asArray(row.features)[index], '待官方文档核验')
          return { product, entry: feature, pageStructure: product === '移动云' ? '依据需求原文' : '待官方文档核验', fields: '待官方文档核验', flow: '待官方文档核验', feedback: '待官方文档核验', resources: '待官方文档核验', protection: asText(row.gap, '待官方文档核验'), status: asText(row.evidenceStatus, product === '移动云' ? 'source-fact' : 'unverified') }
        }),
      }
    })
    return { products: PRODUCTS, features, evidence: input.flatMap((item) => asArray(item.evidence)) }
  }
  return {
    products: PRODUCTS,
    features: asArray(input?.features).map((feature, index) => {
      const featureObject = feature && typeof feature === 'object' && !Array.isArray(feature) ? feature : {}
      const recoveredName = Object.keys(featureObject).filter((key) => /^\d+$/.test(key)).sort((left, right) => Number(left) - Number(right)).map((key) => featureObject[key]).join('')
      const declaredName = asText(featureObject.name || featureObject.title)
      const name = asText(typeof feature === 'string' ? feature : /^同类功能\s*\d+$/.test(declaredName) && recoveredName ? recoveredName : declaredName, `同类功能 ${index + 1}`).replace(/[？?]$/, '')
      return {
      ...featureObject,
      name,
      matrix: PRODUCTS.map((product) => {
        const found = asArray(featureObject.matrix).find((item) => item.product === product) || {}
        return { product, entry: asText(found.entry, product === '移动云' ? '依据需求原文' : '待官方文档核验'), pageStructure: asText(found.pageStructure, '待官方文档核验'), fields: asText(found.fields || found.validation, '待官方文档核验'), flow: asText(found.flow, '待官方文档核验'), feedback: asText(found.feedback, '待官方文档核验'), resources: asText(found.resources, '待官方文档核验'), protection: asText(found.protection, '待官方文档核验'), status: asText(found.status, product === '移动云' ? 'source-fact' : 'unverified') }
      }),
    }}),
    evidence: asArray(input?.evidence),
  }
}

const COMPETITOR_DIMENSIONS = [
  { name: '入口与导航', legacyKey: 'entry', terms: /控制台|导航|入口|菜单|列表|详情/ },
  { name: '页面结构与信息层级', legacyKey: 'pageStructure', terms: /页面|列表|详情|页签|区域|概览/ },
  { name: '页面载体', legacyKey: 'pageStructure', terms: /页面|弹窗|抽屉|向导|控制台|API/ },
  { name: '字段、默认值、必填与校验', legacyKey: 'fields', terms: /参数|字段|名称|必填|可选|取值|校验|格式|长度/ },
  { name: '主流程、分支、取消、返回与回退', legacyKey: 'flow', terms: /创建|删除|查询|查看|修改|取消|返回|步骤|调用|请求/ },
  { name: '成功、失败、异步与状态反馈', legacyKey: 'feedback', terms: /成功|失败|状态|处理中|错误|返回值|响应|任务/ },
  { name: '配额、地域、权限、版本与关联资源限制', legacyKey: 'resources', terms: /配额|地域|区域|权限|版本|限制|VPC|子网|日志|资源|网卡/ },
  { name: '高风险操作保护', legacyKey: 'protection', terms: /删除|释放|停用|不可恢复|权限|确认|限制|风险/ },
  { name: '列表、详情、选择器与多入口一致性', legacyKey: 'pageStructure', terms: /列表|详情|选择|筛选|查询|入口|一致/ },
  { name: '特色能力与明显缺口', legacyKey: 'resources', terms: /支持|能力|限制|不支持|仅支持|最多|当前/ },
]

function evidenceFact(items, dimension) {
  const sentences = items.flatMap((item) => String(item.excerpt || '').split(/(?<=[。；！？.!?])\s*/))
    .map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 12 && sentence.length <= 220 && dimension.terms.test(sentence))
  const selected = unique(sentences).slice(0, 2)
  if (selected.length) return selected.join('；')
  return items.length ? '当前官方证据未覆盖该维度的具体界面或规则' : '当前证据未覆盖'
}

function mobileCloudFact(features, dimension) {
  const values = features.map((feature) => {
    const row = asArray(feature.matrix).find((item) => item.product === '移动云') || {}
    return asText(row[dimension.legacyKey])
  }).filter((value) => value && !/待官方文档核验|依据需求原文/.test(value))
  return unique(values).join('；') || '需求未定义该维度'
}

export function buildCompetitorAnalysis(input, evidenceInput, existing = {}) {
  const competitors = normalizeCompetitors(input)
  const evidence = asArray(evidenceInput).map((item, index) => ({ id: item.id || `E${String(index + 1).padStart(3, '0')}`, ...item }))
  const sourceRefs = unique(competitors.features.flatMap((feature) => asArray(feature.sourceRefs || feature.sources)))
  const productKey = { 阿里云: 'alibabaCloud', 华为云: 'huaweiCloud', 腾讯云: 'tencentCloud' }
  const matrix = competitors.features.flatMap((feature) => COMPETITOR_DIMENSIONS.map((dimension) => {
    const row = { dimension: `${feature.name} · ${dimension.name}`, mobileCloud: mobileCloudFact([feature], dimension), alibabaCloud: '当前证据未覆盖', huaweiCloud: '当前证据未覆盖', tencentCloud: '当前证据未覆盖', designTakeaway: '', evidenceRefs: [], sourceRefs: asArray(feature.sourceRefs || feature.sources) }
    for (const product of PRODUCTS.slice(1)) {
      const items = evidence.filter((item) => item.product === product && item.feature === feature.name && item.url && ['verified', 'partial', 'docs-only'].includes(item.evidenceStatus))
      row[productKey[product]] = evidenceFact(items, dimension)
      row.evidenceRefs.push(...items.map((item) => item.id))
    }
    row.evidenceRefs = unique(row.evidenceRefs)
    const coveredProducts = PRODUCTS.slice(1).filter((product) => row[productKey[product]] !== '当前证据未覆盖' && !row[productKey[product]].startsWith('当前官方证据未覆盖'))
    row.designTakeaway = coveredProducts.length
      ? `可重点核对${coveredProducts.join('、')}在“${dimension.name}”上的表达方式，并结合移动云现有规则决定是否采用；证据未覆盖的细节需在设计评审前补证。`
      : `当前公开证据不足以形成“${dimension.name}”的竞品结论，建议保留为验证项，不据此补写移动云规则。`
    return row
  }))
  const featureEvidence = competitors.features.map((feature) => ({
    feature: feature.name,
    sourceRefs: asArray(feature.sourceRefs || feature.sources),
    products: PRODUCTS.map((product) => {
      const legacy = asArray(feature.matrix).find((item) => item.product === product) || {}
      const refs = evidence.filter((item) => item.product === product && item.feature === feature.name)
      return {
        product,
        entryAndPage: product === '移动云' ? asText(legacy.entry, '需求未定义') : evidenceFact(refs, COMPETITOR_DIMENSIONS[0]),
        structureAndValidation: product === '移动云' ? unique([legacy.pageStructure, legacy.fields].map(asText).filter(Boolean)).join('；') || '需求未定义' : unique([evidenceFact(refs, COMPETITOR_DIMENSIONS[1]), evidenceFact(refs, COMPETITOR_DIMENSIONS[3])]).join('；'),
        flowAndFeedback: product === '移动云' ? unique([legacy.flow, legacy.feedback].map(asText).filter(Boolean)).join('；') || '需求未定义' : unique([evidenceFact(refs, COMPETITOR_DIMENSIONS[4]), evidenceFact(refs, COMPETITOR_DIMENSIONS[5])]).join('；'),
        riskProtection: product === '移动云' ? asText(legacy.protection, '需求未定义') : evidenceFact(refs, COMPETITOR_DIMENSIONS[7]),
        relevance: product === '移动云' ? '本次需求事实' : refs.length ? `与“${feature.name}”直接或部分相关` : '当前证据未覆盖',
        evidenceRefs: refs.map((item) => item.id),
        status: product === '移动云' ? 'source-fact' : refs.some((item) => item.evidenceStatus === 'verified') ? 'verified' : refs.some((item) => item.evidenceStatus === 'partial') ? 'partial' : refs[0]?.evidenceStatus || 'not-found',
      }
    }),
  }))
  return {
    schemaVersion: '1.0',
    scope: existing.scope || competitors.features.map((item) => item.name).join('、'),
    scopeSourceRefs: asArray(existing.scopeSourceRefs).length ? asArray(existing.scopeSourceRefs) : sourceRefs,
    competitors: PRODUCTS,
    matrix,
    featureEvidence,
    evidence,
    blockedSources: evidence.filter((item) => !item.url || ['blocked', 'inaccessible', 'not-found', 'unverified'].includes(item.evidenceStatus)),
  }
}

export function applyOfficialEvidenceToCompetitors(input, evidenceInput) {
  const competitors = normalizeCompetitors(input)
  const evidence = asArray(evidenceInput)
  competitors.evidence = evidence
  competitors.analysis = buildCompetitorAnalysis(competitors, evidence)
  return competitors
}

export function normalizeSkillContract(input, sourceRequirements) {
  const data = input && typeof input === 'object' ? structuredClone(input) : {}
  data.meta = { ...(data.meta || {}), title: asText(data.meta?.title || data.meta?.product, '需求设计分析'), product: asText(data.meta?.product, '未命名产品'), version: asText(data.meta?.version, 'v1.0'), generatedAt: new Date().toISOString() }
  data.requirements = sourceRequirements
  data.overview = data.overview || {}
  data.overview.summary = asText(data.overview.summary, '待补充需求概述')
  data.overview.targetUsers = asArray(data.overview.targetUsers)
  data.overview.scenarios = asArray(data.overview.scenarios)
  data.overview.globalBlockers = asArray(data.overview.globalBlockers).slice(0, 5).map(normalizeQuestion)
  data.pages = asArray(data.pages).map(normalizePage)
  data.overview.pageCount = data.pages.length

  const rawBusinessFlow = data.businessFlow || {}
  const directSwimlane = ['phases', 'lanes', 'nodes', 'edges', 'unknownEdges'].some((key) => Array.isArray(rawBusinessFlow[key])) ? rawBusinessFlow : {}
  const swimlane = rawBusinessFlow.swimlane || rawBusinessFlow.swimlanes || directSwimlane
  const phases = asArray(swimlane.phases).map((phase, index) => typeof phase === 'string' ? { id: slug(phase, `phase-${index + 1}`), title: phase, order: index + 1 } : { ...phase, id: asText(phase.id, slug(phase.title, `phase-${index + 1}`)), title: asText(phase.title, `阶段 ${index + 1}`), order: Number(phase.order) || index + 1 })
  const lanes = asArray(swimlane.lanes).map((lane, index) => typeof lane === 'string' ? { id: slug(lane, `lane-${index + 1}`), title: lane, kind: /系统|后台|数据|前端/.test(lane) ? 'system' : 'actor', order: index + 1 } : { ...lane, id: asText(lane.id, slug(lane.title, `lane-${index + 1}`)), title: asText(lane.title, `参与方 ${index + 1}`), kind: asText(lane.kind, 'actor'), order: Number(lane.order) || index + 1 })
  const phaseMap = new Map(phases.flatMap((item) => [[item.id, item.id], [item.title, item.id]]))
  const laneMap = new Map(lanes.flatMap((item) => [[item.id, item.id], [item.title, item.id]]))
  const nodes = asArray(swimlane.nodes).map((node, index) => ({ ...node, id: asText(node?.id, `node-${index + 1}`), lane: laneMap.get(node?.lane) || asText(node?.lane), phase: phaseMap.get(node?.phase) || asText(node?.phase), title: asText(node?.title || node?.label, `业务动作 ${index + 1}`), subtitle: asText(node?.subtitle || node?.description, node?.pageId ? `页面：${node.pageId}` : ''), pageId: asText(node?.pageId), systemAction: Boolean(node?.systemAction), origin: node?.origin === 'design_inference' ? 'design_inference' : 'source_fact', sources: asArray(node?.sources) }))
  data.businessFlow = { swimlane: { title: asText(swimlane.title, '需求相关的业务流程'), subtitle: asText(swimlane.subtitle, '泳道、主路径、分支路径与页面定位'), phases, lanes, nodes, edges: asArray(swimlane.edges).map((edge) => ({ ...edge, from: asText(edge?.from), to: asText(edge?.to), kind: ['main', 'branch', 'exception', 'rollback', 'unknown'].includes(edge?.kind) ? edge.kind : 'main', label: asText(edge?.label), sources: asArray(edge?.sources) })), unknownEdges: asArray(swimlane.unknownEdges) } }

  const rawLayers = asArray(data.afLayers || data.businessFlow?.afLayers)
  data.afLayers = LAYERS.map((layer) => {
    const found = rawLayers.find((item) => asText(item?.layer || item?.level || item?.name).replace(/\s/g, '').startsWith(layer[0]))
    const keyFunctions = asArray(found?.keyFunctions || found?.keyFunctionPoints || found?.functions)
    const dataSources = asArray(found?.dataSources || found?.dataSource || found?.sourcesOfData)
    const normalized = found && keyFunctions.length && dataSources.length && !/待补充分析/.test(asText(found.responsibility || found.duty))
      ? { ...found, layer, responsibility: asText(found.responsibility || found.duty), keyFunctions, dataSources, sources: asArray(found.sources) }
      : fallbackLayer(layer, data.pages, sourceRequirements)
    return normalized
  })

  const rawPageFlow = data.pageFlow || {}
  const flowLanes = asArray(rawPageFlow.lanes).map((lane, index) => typeof lane === 'string' ? { id: slug(lane, `level-${index + 1}`), title: lane } : { ...lane, id: asText(lane.id, `level-${index + 1}`), title: asText(lane.title, `页面层级 ${index + 1}`) })
  const flowLaneMap = new Map(flowLanes.flatMap((item) => [[item.id, item.id], [item.title, item.id]]))
  data.pageFlow = {
    lanes: flowLanes,
    pages: asArray(rawPageFlow.pages).map((page, index) => { const detail = data.pages.find((item) => item.id === page.id); return { ...page, id: asText(page.id, detail?.id || `page-${index + 1}`), lane: flowLaneMap.get(page.lane) || flowLanes[0]?.id || 'level-1', title: asText(page.title || page.name, detail?.name || `页面 ${index + 1}`), businessDomain: asText(page.businessDomain, detail?.module || '未明确业务域'), modules: asArray(page.modules).length ? asArray(page.modules) : detail ? [detail.module] : [], origin: page.origin || detail?.origin || 'source_fact', sources: asArray(page.sources).length ? asArray(page.sources) : detail?.sources || [] } }),
    edges: asArray(rawPageFlow.edges).map((edge) => ({ ...edge, from: asText(edge.from), fromModule: asText(edge.fromModule, '页面入口'), to: asText(edge.to), trigger: asText(edge.trigger, '点击或操作'), label: asText(edge.label), sources: asArray(edge.sources) })),
    unknownEdges: asArray(rawPageFlow.unknownEdges),
    coverage: asArray(rawPageFlow.coverage),
  }

  const rawDesign = data.designReview || {}
  data.designReview = {
    crossPageConstraints: asArray(rawDesign.crossPageConstraints).slice(0, 6).map((item) => typeof item === 'string' ? { rule: item, impactPages: data.pages.map((page) => page.name), design: '在受影响页面保持术语、状态、校验和反馈一致', sources: [] } : { ...item, rule: asText(item.rule || item.title || item.constraint), impactPages: asArray(item.impactPages || item.affectedPages), design: asText(item.design || item.advice || item.designUnify || item.recommendation), sources: asArray(item.sources) }),
    pages: data.pages.map((page) => { const existing = asArray(rawDesign.pages).find((item) => item.pageId === page.id); const items = asArray(existing?.items); return { pageId: page.id, items: items.length ? items.map((item) => normalizeReviewItem(item, item.type || 'design_point', page.sources)) : [...page.designPoints, ...page.designRisks] } }),
    terminology: Array.isArray(rawDesign.terminology) ? rawDesign.terminology.map((item) => ({ ...item, term: asText(item.term || item.name || item.differentTerms || item.different || item.variants), definition: asText(item.definition || item.value || item.unifiedTerm || item.unified || item.preferred), inconsistencies: asText(item.inconsistencies || item.locations || item.usage || item.position), sources: asArray(item.sources || item.sourceRefs) })) : Object.entries(rawDesign.terminology || {}).map(([term, definition]) => ({ term, definition: asText(definition), inconsistencies: '', sources: [] })),
    globalBlockers: [],
  }

  data.competitors = normalizeCompetitors(data.competitors)
  data.competitorAnalysis = data.competitorAnalysis || data.competitors.analysis || buildCompetitorAnalysis(data.competitors, data.competitors.evidence)
  data.knowledgeRetrieval = data.knowledgeRetrieval || { knowleddge: { status: 'skipped', reason: '独立 API 环境未接入知识库' }, 'fallback-kb': { status: 'skipped', reason: '独立 API 环境未接入知识库' } }
  const coverageMap = new Map(asArray(data.coverage).map((item) => [item.sourceId || item.id, item]))
  data.coverage = sourceRequirements.map((source) => { const found = coverageMap.get(source.id); return { sourceId: source.id, status: ['covered', 'uncertain', 'missing'].includes(found?.status) ? found.status : 'covered', modules: asArray(found?.modules), pages: asArray(found?.pages), notes: asText(found?.notes, found ? '' : '已纳入结构化解析；需在模型质量门禁中复核具体落点') } })
  return data
}

export function validateSkillContract(data, sourceRequirements, options = {}) {
  const errors = []
  const required = ['meta', 'requirements', 'overview', 'businessFlow', 'afLayers', 'pageFlow', 'pages', 'designReview', 'competitors', 'knowledgeRetrieval', 'coverage']
  for (const key of required) if (!data?.[key]) errors.push(`缺少 ${key}`)
  const requirementIds = new Set(asArray(data?.requirements).map((item) => item.id))
  for (const item of sourceRequirements) if (!requirementIds.has(item.id)) errors.push(`遗漏原文 ${item.id}`)
  if (asArray(data?.overview?.globalBlockers).length > 5) errors.push('全局阻塞问题超过5条')
  const pageIds = new Set(asArray(data?.pages).map((item) => item.id))
  if (!pageIds.size) errors.push('缺少页面详情')
  if (!asArray(data?.businessFlow?.swimlane?.phases).length || !asArray(data?.businessFlow?.swimlane?.lanes).length || !asArray(data?.businessFlow?.swimlane?.nodes).length) errors.push('缺少完整业务泳道结构')
  const normalizedPageNames = asArray(data?.pages).map((item) => asText(item.name).replace(/页面|页|弹窗|窗口|\s/g, ''))
  for (const baselinePage of asArray(options.baselinePages)) {
    const baselineName = asText(baselinePage?.name || baselinePage).replace(/页面|页|弹窗|窗口|\s/g, '')
    if (baselineName && !normalizedPageNames.some((name) => name.includes(baselineName) || baselineName.includes(name))) errors.push(`相同原文的上一版页面未保留：${asText(baselinePage?.name || baselinePage)}`)
  }
  for (const page of asArray(data?.pages)) {
    const pendingDesignSpecification = page.origin === 'design_required' && asArray(page.openQuestions).length
    if (!asArray(page.fields).length && !asArray(page.interactionRules).length && !pendingDesignSpecification) errors.push(`${page.name} 缺少字段与交互规格`)
    if (!asArray(page.designPoints).length && !asArray(page.designRisks).length) errors.push(`${page.name} 缺少设计核对内容`)
  }
  for (const page of asArray(data?.pageFlow?.pages)) if (!pageIds.has(page.id)) errors.push(`页面流程引用未知页面 ${page.id}`)
  if (asArray(data?.pageFlow?.pages).length !== pageIds.size) errors.push('页面流程未覆盖全部页面')
  if (pageIds.size > 1 && !asArray(data?.pageFlow?.edges).length && !asArray(data?.pageFlow?.unknownEdges).length) errors.push('多页面需求缺少页面跳转或未确定跳转')
  const reviewIds = new Set(asArray(data?.designReview?.pages).map((item) => item.pageId))
  for (const pageId of pageIds) if (!reviewIds.has(pageId)) errors.push(`设计要点遗漏页面 ${pageId}`)
  for (const group of asArray(data?.designReview?.pages)) if (!asArray(group.items).length) errors.push(`设计要点页面 ${group.pageId} 没有内容`)
  if (asArray(data?.designReview?.crossPageConstraints).length > 6) errors.push('跨页面约束超过6条')
  if (asArray(data?.designReview?.globalBlockers).length) errors.push('设计要点不得重复全局阻塞问题')
  for (const [index, item] of asArray(data?.designReview?.terminology).entries()) {
    if (!asText(item?.term)) errors.push(`术语统一第 ${index + 1} 条缺少界面术语`)
    if (!asText(item?.definition)) errors.push(`术语统一第 ${index + 1} 条缺少统一口径`)
    if (!asText(item?.inconsistencies)) errors.push(`术语统一第 ${index + 1} 条缺少不一致位置`)
  }
  if (asArray(data?.afLayers).length !== 6) errors.push('A-F 分层必须完整')
  for (const layer of asArray(data?.afLayers)) if (!asArray(layer.keyFunctions).length || !asArray(layer.dataSources).length || /待补充分析/.test(layer.responsibility)) errors.push(`${layer.layer} 内容不完整`)
  if (options.requireModelLayers && asArray(data?.afLayers).some((layer) => layer.origin === 'design_inference')) errors.push('A-F 分层未由模型按合同完整输出，仍依赖兜底归纳')
  const products = asArray(data?.competitors?.products)
  for (const product of PRODUCTS) if (!products.includes(product)) errors.push(`竞品范围缺少 ${product}`)
  if (!asArray(data?.competitors?.features).length) errors.push('缺少竞品功能单元')
  for (const feature of asArray(data?.competitors?.features)) for (const product of PRODUCTS) if (!asArray(feature.matrix).some((row) => row.product === product)) errors.push(`${feature.name} 缺少 ${product} 对比行`)
  if (!asArray(data?.competitorAnalysis?.matrix).length) errors.push('缺少 research-requirement-competitors 标准对比矩阵')
  if (!asArray(data?.competitorAnalysis?.featureEvidence).length) errors.push('缺少分功能竞品证据卡数据')
  const coverage = asArray(data?.coverage)
  if (coverage.length !== sourceRequirements.length) errors.push('覆盖台账条数与原文不一致')
  if (coverage.some((item) => item.status === 'missing')) errors.push('覆盖台账存在 missing')
  return { ok: errors.length === 0, errors: unique(errors) }
}
