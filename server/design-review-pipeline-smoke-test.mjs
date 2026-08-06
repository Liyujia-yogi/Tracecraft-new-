import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractDesignHtmlEvidence, generateModelDesignReview, generateModelRawRequirementReview, generateModelUiDesignReview, renderDesignPreviewHtml } from './design-review-pipeline.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-review-pipeline-'))

function textNode(id, text, x, y) {
  return { id, name: text, type: 'TEXT', visible: true, characters: text, absoluteBoundingBox: { x, y, width: 100, height: 24 }, style: { fontSize: 14, fontWeight: 'regular', fills: [{ type: 'SOLID', visible: true, color: { r: 0.1, g: 0.1, b: 0.1 } }] } }
}

const frames = [
  { id: 'frame-1', name: '弹性带宽池控制台', type: 'FRAME', visible: true, absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 900 }, children: [textNode('text-1', '创建弹性带宽池', 100, 80), { id: 'button-1', name: '组件按钮', type: 'INSTANCE', visible: true, mainComponent: { name: '组件按钮' }, variantProperties: [['状态', '默认']], absoluteBoundingBox: { x: 100, y: 120, width: 120, height: 32 }, children: [] }] },
  { id: 'frame-2', name: '创建弹性带宽池', type: 'FRAME', visible: true, absoluteBoundingBox: { x: 1500, y: 0, width: 1440, height: 900 }, children: [textNode('text-2', '带宽池名称', 1600, 100), textNode('text-3', '确认创建', 1600, 160)] },
]
const payload = { isFromPlugin: true, name: '弹性公网IP', document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [{ id: 'page-1', name: '页面', type: 'CANVAS', children: frames }] }, styles: {}, components: {} }
const pagedFrames = { 'page-1': { name: '页面', frames: frames.map((frame) => ({ id: frame.id, name: frame.name })) } }
const html = `<!doctype html><html><head><script>var PAGED_FRAMES = ${JSON.stringify(pagedFrames)}, SETTINGS = {}, FILE_DATA = "${encodeURIComponent(JSON.stringify(payload))}";</script></head><body></body></html>`

try {
  const evidence = extractDesignHtmlEvidence(html, 'pixso.html')
  assert.equal(evidence.sourceType, 'pixso-html')
  assert.equal(evidence.frames.length, 2)
  assert.equal(evidence.frames[0].texts.some((item) => item.text === '创建弹性带宽池'), true)
  assert.equal(evidence.frames[0].components[0].variants['状态'], '默认')
  assert.ok(JSON.stringify(evidence).length < html.length)

  const fallbackPixsoPreview = renderDesignPreviewHtml(html, 'pixso.html')
  assert.match(fallbackPixsoPreview, /class="design-frame"/)
  const packagedPixsoPreview = renderDesignPreviewHtml(html, 'pixso.html', { assetBaseUrl: '/uploads/design-package-1/pixso/' })
  assert.match(packagedPixsoPreview, /<base href="\/uploads\/design-package-1\/pixso\/">/)
  assert.match(packagedPixsoPreview, /FILE_DATA/)
  assert.doesNotMatch(packagedPixsoPreview, /class="design-frame"/)

  const regular = extractDesignHtmlEvidence(`<html><head><script>${'x'.repeat(1_000_000)}</script></head><body><h1>资源列表</h1><button>提交</button></body></html>`, 'regular.html')
  assert.equal(regular.sourceType, 'html')
  assert.equal(regular.signals.some((item) => item.text === '提交'), true)
  assert.ok(JSON.stringify(regular).length < 10_000)

  const sketchData = {
    artboards: [{
      objectID: 'artboard-1',
      pageName: '订购',
      name: '批量变更',
      width: 1200,
      height: 800,
      imagePath: 'preview/batch.png',
      layers: [
        { objectID: 'background', type: 'shape', name: '背景', rect: { x: 0, y: 0, width: 1200, height: 800 }, fills: [{ fillType: 'Color', color: { 'css-rgba': 'rgba(255,255,255,1)' } }] },
        { objectID: 'title', type: 'text', name: '标题', content: '批量变更', rect: { x: 40, y: 32, width: 160, height: 32 }, fontSize: 20, color: { 'color-hex': '#031129 100%' } },
      ],
    }],
  }
  const sketchHtml = `<!doctype html><html><head><title>Spec Export - Sketch MeaXure</title></head><body><script>let data = ${JSON.stringify(sketchData)}; meaxure.render(data);</script></body></html>`
  const sketchEvidence = extractDesignHtmlEvidence(sketchHtml, 'sketch.html')
  assert.equal(sketchEvidence.sourceType, 'sketch-meaxure-html')
  assert.equal(sketchEvidence.frames[0].texts[0].text, '批量变更')
  const sketchPreview = renderDesignPreviewHtml(sketchHtml, 'sketch.html')
  assert.match(sketchPreview, /结构还原预览/)
  assert.match(sketchPreview, /data-review-anchor="批量变更"/)
  const packagedSketchPreview = renderDesignPreviewHtml(sketchHtml, 'sketch.html', { assetBaseUrl: '/uploads/design-package-1/' })
  assert.match(packagedSketchPreview, /原始设计图预览/)
  assert.match(packagedSketchPreview, /href="\/uploads\/design-package-1\/preview\/batch.png"/)
  assert.doesNotMatch(packagedSketchPreview, /结构还原预览/)

  const savedPath = 'pixso.html'
  fs.writeFileSync(path.join(tempDir, savedPath), html, 'utf8')
  const calls = []
  const result = await generateModelDesignReview({
    requirement: { productName: '带宽' },
    analysis: { analysisData: { overview: { summary: '支持创建和管理弹性带宽池' }, pages: [{ id: 'list', name: '弹性带宽池控制台', fields: [], interactionRules: ['支持创建'], steps: ['点击创建'], feedback: {}, designPoints: [], designRisks: [] }, { id: 'create', name: '创建弹性带宽池', fields: [{ name: '带宽池名称' }], interactionRules: ['名称必填'], steps: ['填写名称', '确认创建'], feedback: {}, designPoints: [], designRisks: [] }], designReview: { crossPageConstraints: [{ rule: '名称保持一致' }], terminology: [] } } },
    design: { files: [{ name: 'pixso.html', savedPath, extension: '.html' }] },
    uploadDir: tempDir,
    systemPrompt: '只返回 JSON',
    callModel: async (_system, content) => {
      calls.push(content)
      const text = content.find((item) => item.type === 'input_text')?.text || ''
      assert.ok(text.length < 260_000)
      return JSON.stringify({ summary: '完成评审', issues: text.includes('跨页面一致性') ? [] : [{ type: '【体验】一致性', process: 'UX设计与评审', title: '页面信息需核对', detail: '设计证据与需求字段需要逐项核对', people: '设计师', severity: 'medium', conformity: 'nonconforming' }] })
    },
  })
  assert.equal(calls.length, 3)
  assert.equal(result.issues.length, 1)
  assert.match(result.summary, /2 个设计页面/)

  const partialCalls = []
  const partialResult = await generateModelDesignReview({
    requirement: { productName: '带宽' },
    analysis: { analysisData: { overview: { summary: '支持创建和管理弹性带宽池' }, pages: [], designReview: { crossPageConstraints: [], terminology: [] } } },
    design: { files: [{ name: 'pixso.html', savedPath, extension: '.html' }] },
    uploadDir: tempDir,
    systemPrompt: '只返回 JSON',
    concurrency: 1,
    callModel: async (_system, content) => {
      const text = content.find((item) => item.type === 'input_text')?.text || ''
      partialCalls.push(text)
      if (text.includes('页面名称') || text.includes('页面：创建弹性带宽池') || text.includes('"name":"创建弹性带宽池"')) throw new Error('模拟网络中断')
      return JSON.stringify({ summary: '完成评审', issues: [{ type: '【体验】一致性', process: 'UX设计与评审', title: '保留成功页面', detail: '成功页面结果不应丢失', people: '设计师' }] })
    },
  })
  assert.equal(partialResult.partial, true)
  assert.deepEqual(partialResult.failedPages, ['创建弹性带宽池'])
  assert.equal(partialResult.issues.some((issue) => issue.title === '保留成功页面'), true)
  assert.equal(partialCalls.length, 2)

  const retriedPages = []
  const retriedResult = await generateModelDesignReview({
    requirement: { productName: '带宽' },
    analysis: { analysisData: { overview: { summary: '支持创建和管理弹性带宽池' }, pages: [], designReview: { crossPageConstraints: [], terminology: [] } } },
    design: { files: [{ name: 'pixso.html', savedPath, extension: '.html' }] },
    uploadDir: tempDir,
    systemPrompt: '只返回 JSON',
    concurrency: 1,
    pageNames: partialResult.failedPages,
    callModel: async (_system, content) => {
      const text = content.find((item) => item.type === 'input_text')?.text || ''
      retriedPages.push(text)
      return JSON.stringify({ summary: '重试完成', issues: [] })
    },
  })
  assert.equal(retriedResult.partial, false)
  assert.deepEqual(retriedResult.failedPages, [])
  assert.equal(retriedPages.length, 2)

  const uiReviewCalls = []
  const uiReviewResult = await generateModelUiDesignReview({
    requirement: { productName: '带宽', source: { text: '用户需要创建并管理弹性带宽池。' } },
    analysis: { analysisData: { overview: { summary: '支持创建和管理弹性带宽池' }, pages: [], designReview: { crossPageConstraints: [], terminology: [] } } },
    design: { files: [{ name: 'pixso.html', savedPath, extension: '.html' }] },
    uploadDir: tempDir,
    systemPrompt: 'review-ui-design rules',
    callModel: async (system, content) => {
      uiReviewCalls.push({ system, content })
      return JSON.stringify({
        summary: 'UI 质量评审完成',
        strengths: ['核心任务入口清晰'],
        evidenceLimitations: ['静态稿无法验证焦点状态'],
        openQuestions: ['需验证键盘操作'],
        issues: [{ area: 'visual', priority: 'P1', confidence: 'high', title: '主次按钮视觉重量接近', location: '页面操作区', phenomenon: '两个按钮强调程度接近', evidence: '设计结构证据', impact: '主操作识别变慢', advice: '降低次按钮视觉重量', verification: '模糊观察时主按钮仍是第一焦点', annotation: { pageName: '弹性带宽池控制台', pageFileName: '弹性带宽池控制台', anchorText: '创建弹性带宽池', x: 20, y: 10, coordinateMode: 'normalized', confidence: 0.8 } }],
      })
    },
  })
  assert.equal(uiReviewCalls.length, 3)
  assert.equal(uiReviewResult.issues[0].basis, 'ui_review_skill')
  assert.equal(uiReviewResult.issues[0].reviewCode, 'V1')
  assert.equal(uiReviewResult.issues[0].reviewPriority, 'P1')
  assert.deepEqual(uiReviewResult.strengths, ['核心任务入口清晰'])

  const rawHtmlPath = 'raw-design.html'
  fs.writeFileSync(path.join(tempDir, rawHtmlPath), '<html><body><h1>批量变更</h1><button>提交</button><p>处理失败</p></body></html>', 'utf8')
  const rawSource = `${'需求规则：批量变更需要展示处理结果。\n\n'.repeat(1800)}文档结尾验收条件：失败后必须支持重试。`
  const rawCalls = []
  const rawResult = await generateModelRawRequirementReview({
    requirement: { productName: 'IP', source: { text: rawSource } },
    design: { files: [{ name: 'raw-design.html', savedPath: rawHtmlPath, extension: '.html' }] },
    uploadDir: tempDir,
    compliancePrompt: '需求符合性评审',
    experiencePrompt: 'validate-user-experience rules',
    experienceSkillVersion: 'validate-user-experience-test',
    callModel: async (system, content) => {
      const text = content.find((item) => item.type === 'input_text')?.text || ''
      rawCalls.push({ system, text })
      if (system.includes('评审证据提取器')) {
        return JSON.stringify({ userGoals: ['完成批量变更'], roles: ['用户'], scenarios: [], pages: [{ name: '批量变更', facts: ['支持提交'] }], businessRules: ['失败后支持重试'], fields: [], states: ['失败'], exceptions: ['处理失败'], acceptanceCriteria: ['可重试'], openQuestions: [], sourceExcerpts: ['失败后必须支持重试'] })
      }
      if (system.includes('validate-user-experience')) {
        return JSON.stringify({ review: { mode: 'design', evidence_status: 'partial', conclusion: 'conditional_pass', summary: '存在恢复风险' }, task_coverage: [{ id: 'TASK-01', name: '完成批量变更', role: '用户', criticality: 'critical', status: 'partial', evidence: ['批量变更页'], gaps: ['失败恢复'] }], positive_evidence: ['提交入口清晰'], issues: [{ id: 'EVA-001', severity: 'P2', title: '失败后不知道如何继续', dimension: '容错与可恢复性', task_stage: '结果', rule_type: 'requirement', evidence_type: 'observed', evidence: ['批量变更页/失败文案'], observation: '页面只有失败文案', user_perspective: '我该怎么办', root_cause: '缺少重试入口', user_impact: '任务中断', recommendation: '提供重试', acceptance_criteria: ['失败后保留输入并提供重试入口'], similar_checks: ['检查批量任务'], confidence: 'high' }], gaps: ['键盘与响应式待验证'], retest: ['复测失败恢复'] })
      }
      return JSON.stringify({ summary: '需求符合性完成', issues: [{ type: '【产品】功能缺失', process: '需求设计与评审', title: '缺少重试入口', detail: '需求要求失败后支持重试', people: '设计师', severity: 'medium', conformity: 'nonconforming', evidenceStatus: 'sufficient' }] })
    },
  })
  const extractionCalls = rawCalls.filter((call) => call.system.includes('评审证据提取器'))
  assert.ok(extractionCalls.length > 1)
  assert.equal(extractionCalls.some((call) => call.text.includes('文档结尾验收条件')), true)
  assert.equal(rawResult.rawEvidenceStats.sourceCharacters, rawSource.length)
  assert.equal(rawResult.issues.some((issue) => issue.basis === 'validate_user_experience' && issue.reviewCode === 'EVA-001' && issue.experienceLevel === 'P2'), true)
  assert.equal(rawResult.experienceSkillVersion, 'validate-user-experience-test')
  assert.deepEqual(rawResult.experiencePositiveEvidence, ['提交入口清晰'])
  assert.deepEqual(rawResult.experienceGaps, ['键盘与响应式待验证'])
  assert.equal(rawResult.validationConclusion, 'conditional')
  console.log('design-review-pipeline-smoke: ok')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
