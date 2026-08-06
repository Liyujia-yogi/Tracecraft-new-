<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Delete, DocumentChecked, Files, MagicStick, Refresh, UploadFilled, Warning } from '@element-plus/icons-vue'
import type { UploadFile, UploadInstance } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { BootstrapData, Disposition, Requirement, ReviewIssue } from '../types'
import PageTitle from '../components/PageTitle.vue'
import IssueEditor from '../components/IssueEditor.vue'
import ReviewPageView from '../components/ReviewPageView.vue'
import DesignPreviewFrame from '../components/DesignPreviewFrame.vue'

const props = defineProps<{ data: BootstrapData; initialTarget: { requirementId: string; reviewId: string } | null }>()
const emit = defineEmits<{ refresh: [] }>()
const selectedId = ref(props.initialTarget?.requirementId || props.data.requirements[0]?.id || '')
const requirement = ref<Requirement | null>(null)
const selectedReviewId = ref(props.initialTarget?.reviewId || '')
const busy = ref('')
const designFiles = ref<File[]>([])
const designUploadRef = ref<UploadInstance>()
const designNote = ref('')
const competitorFiles = ref<File[]>([])
const featureName = ref('')
const useReviewUiDesign = ref(false)
const pendingOnly = ref(false)
const issueQuery = ref('')
const activeIssueId = ref('')
const resultView = ref<'list' | 'page'>('list')
const reviewElapsedSeconds = ref(0)
const reviewFeedback = ref<{ type: 'info' | 'success' | 'warning' | 'error'; title: string; description: string } | null>(null)
let reviewTimer = 0

const review = computed(() => requirement.value?.reviews.find(item => item.id === selectedReviewId.value) || requirement.value?.reviews.at(-1))
const latestDesign = computed(() => requirement.value?.designVersions.at(-1))
const processedCount = computed(() => review.value?.issues.filter(item => item.disposition !== 'pending').length || 0)
const uiDesignReviewIssueCount = computed(() => review.value?.issues.filter(item => item.basis === 'ui_review_skill').length || 0)
const reviewOverview = computed(() => {
  const issues = review.value?.issues || []
  return {
    pending: issues.filter(item => item.disposition === 'pending').length,
    accepted: issues.filter(item => item.disposition === 'accepted').length,
    partial: issues.filter(item => item.disposition === 'partial').length,
    rejected: issues.filter(item => item.disposition === 'rejected').length,
    highRisk: issues.filter(item => item.severity === 'high').length,
  }
})
const filteredIssues = computed(() => (review.value?.issues || []).filter(item => (!pendingOnly.value || item.disposition === 'pending') && (!issueQuery.value || `${item.title}${item.detail}${item.type}`.toLowerCase().includes(issueQuery.value.toLowerCase()))))
const activeIssue = computed(() => filteredIssues.value.find(item => item.id === activeIssueId.value) || filteredIssues.value[0])

const dispositionLabel: Record<Disposition, string> = { pending: '待处理', accepted: '采纳', partial: '部分采纳', rejected: '不采纳', deferred: '待定' }
const conclusionLabel = { passed: '通过', conditional: '有条件通过', not_passed: '不通过', undetermined: '暂不判定', '': '已完成' }

async function load() {
  if (!selectedId.value) return
  requirement.value = (await api.getRequirement(selectedId.value)).requirement
  if (props.initialTarget?.reviewId) selectedReviewId.value = props.initialTarget.reviewId
  else if (!selectedReviewId.value) selectedReviewId.value = requirement.value.reviews.at(-1)?.id || ''
  activeIssueId.value = review.value?.issues[0]?.id || ''
}

async function task(name: string, action: () => Promise<{ requirement: Requirement }>, message: string) {
  busy.value = name
  try {
    requirement.value = (await action()).requirement
    emit('refresh')
    ElMessage.success(message)
    return true
  } catch (error) {
    ElMessage.error((error as Error).message)
    return false
  } finally {
    busy.value = ''
  }
}

function collectFiles(target: 'design' | 'competitor', file: UploadFile, files: UploadFile[]) {
  const raws = files.map(item => item.raw).filter(Boolean) as File[]
  target === 'design' ? designFiles.value = raws : competitorFiles.value = raws
}
function onDesignChange(file: UploadFile, files: UploadFile[]) { collectFiles('design', file, files) }
function onCompetitorChange(file: UploadFile, files: UploadFile[]) { collectFiles('competitor', file, files) }
function selectIssue(id: string) { activeIssueId.value = id }

async function uploadDesigns() {
  if (!requirement.value || !designFiles.value.length) return
  const body = new FormData(); designFiles.value.forEach(file => body.append('files', file)); body.append('note', designNote.value)
  const uploaded = await task('design-upload', () => api.uploadDesigns(requirement.value!.id, body), '设计稿版本已上传')
  if (uploaded) clearPendingDesigns()
}

function clearPendingDesigns() {
  designFiles.value = []
  designNote.value = ''
  designUploadRef.value?.clearFiles()
}

async function clearUploadedDesigns() {
  if (!requirement.value || !latestDesign.value) return
  try {
    await ElMessageBox.confirm(
      '将删除当前需求的全部设计稿版本和未保存评审结果，且不可恢复。是否继续？',
      '清空已上传设计稿',
      { type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  const cleared = await task('design-clear', () => api.clearDesigns(requirement.value!.id), '已清空上传的设计稿')
  if (cleared) {
    selectedReviewId.value = ''
    activeIssueId.value = ''
    reviewFeedback.value = null
    resultView.value = 'list'
  }
}

async function uploadCompetitors() {
  if (!requirement.value || !competitorFiles.value.length || !featureName.value.trim()) return
  const body = new FormData(); competitorFiles.value.forEach(file => body.append('files', file)); body.append('featureName', featureName.value)
  await task('competitor-upload', () => api.uploadCompetitors(requirement.value!.id, body), '竞品材料已识别')
  competitorFiles.value = []; featureName.value = ''
}

async function runReview() {
  if (!requirement.value || busy.value) return
  busy.value = 'review'
  reviewElapsedSeconds.value = 0
  reviewFeedback.value = {
    type: 'info',
    title: '评审任务已启动',
    description: useReviewUiDesign.value
      ? '正在生成基础评审并执行 UI 专家评审，请勿重复提交。'
      : '正在分析需求与设计稿，请勿重复提交。',
  }
  reviewTimer = window.setInterval(() => { reviewElapsedSeconds.value += 1 }, 1000)
  try {
    requirement.value = (await api.runReview(requirement.value.id, { useReviewUiDesign: useReviewUiDesign.value })).requirement
    selectedReviewId.value = requirement.value.reviews.at(-1)?.id || ''
    emit('refresh')
    if (review.value?.baseReviewStatus === 'partial') {
      reviewFeedback.value = {
        type: 'warning',
        title: '评审已部分完成',
        description: `已保留成功页面的结果，仍有 ${review.value.failedReviewPages.length} 个页面需要重试。`,
      }
      ElMessage.warning('部分页面评审失败，已保留成功结果')
    } else if (useReviewUiDesign.value && review.value?.uiDesignReviewStatus === 'failed') {
      reviewFeedback.value = { type: 'error', title: '基础评审已完成', description: 'UI 专家评审执行失败，请查看下方具体错误。' }
      ElMessage.warning('基础设计评审已生成，UI 专家评审执行失败')
    } else {
      reviewFeedback.value = { type: 'success', title: '新一轮评审已完成', description: `评审 V${review.value?.versionNo || ''} 已生成并展示在下方。` }
      ElMessage.success(useReviewUiDesign.value ? '设计评审与 UI 专家评审已生成' : '设计评审已生成')
    }
  } catch (error) {
    const message = (error as Error).message
    reviewFeedback.value = { type: 'error', title: '评审发起失败', description: message }
    ElMessage.error(message)
  } finally {
    window.clearInterval(reviewTimer)
    busy.value = ''
  }
}

async function retryReviewPages() {
  if (!requirement.value || !review.value || review.value.baseReviewStatus !== 'partial') return
  const retried = await task(
    'retry-review-pages',
    () => api.retryReviewPages(requirement.value!.id, review.value!.id),
    '失败页面已重新评审',
  )
  if (!retried) return
  if (review.value?.baseReviewStatus === 'partial') {
    reviewFeedback.value = {
      type: 'warning',
      title: '仍有页面未完成',
      description: `成功结果已继续保留，剩余 ${review.value.failedReviewPages.length} 个页面可再次重试。`,
    }
  } else {
    reviewFeedback.value = { type: 'success', title: '评审已补全', description: '失败页面已完成重试，本轮评审结果现已完整。' }
  }
}

async function updateIssue(issue: ReviewIssue, body: object) {
  if (!requirement.value || !review.value) return
  await task(issue.id, () => api.updateIssue(requirement.value!.id, review.value!.id, issue.id, body), '评审反馈已暂存')
}

async function saveReview() {
  if (!requirement.value || !review.value) return
  await ElMessageBox.confirm('保存后将成为不可修改的评审快照，是否继续？', '保存评审记录', { type: 'warning' })
  await task('save-review', () => api.saveReview(requirement.value!.id, review.value!.id), '评审记录已保存')
}

async function discardReview() {
  if (!requirement.value || !review.value) return
  await ElMessageBox.confirm('临时结果将被放弃，是否继续？', '放弃本轮评审', { type: 'warning' })
  await task('discard-review', () => api.discardReview(requirement.value!.id, review.value!.id), '本轮评审已放弃')
  selectedReviewId.value = requirement.value?.reviews.at(-1)?.id || ''
}

watch(selectedId, load)
watch(() => props.initialTarget, target => { if (target) { selectedId.value = target.requirementId; selectedReviewId.value = target.reviewId; load() } })
watch(filteredIssues, items => { if (!items.some(item => item.id === activeIssueId.value)) activeIssueId.value = items[0]?.id || '' })
onMounted(load)
onBeforeUnmount(() => window.clearInterval(reviewTimer))
</script>

<template>
  <PageTitle eyebrow="DESIGN REVIEW" title="设计评审" description="需求证据、设计稿和竞品材料在同一工作台完成校验与反馈。" />
  <el-card shadow="never" class="review-selector-card">
    <el-form inline><el-form-item label="选择需求"><el-select v-model="selectedId" :disabled="Boolean(busy)" filterable placeholder="请选择需求" style="width:min(680px,70vw)"><el-option v-for="item in data.requirements" :key="item.id" :label="`${item.productName} · ${item.requirementName} · ${item.version}`" :value="item.id" /></el-select></el-form-item><el-form-item v-if="requirement?.reviews.length" label="评审版本"><el-select v-model="selectedReviewId" :disabled="Boolean(busy)"><el-option v-for="item in requirement.reviews" :key="item.id" :label="`评审 V${item.versionNo}${item.saved ? ' · 已保存' : ' · 临时'}`" :value="item.id" /></el-select></el-form-item></el-form>
  </el-card>

  <template v-if="requirement">
    <el-alert :title="`${requirement.productName} · ${requirement.version}`" :description="requirement.summary" type="info" :closable="false" show-icon class="section-alert" />
    <div class="review-input-grid">
      <el-card shadow="never"><template #header><div class="card-header"><div><span class="eyebrow">DESIGN INPUT</span><h2>设计稿</h2></div><el-tag v-if="latestDesign" type="success">当前 V{{ latestDesign.versionNo }}</el-tag></div></template><el-upload ref="designUploadRef" drag multiple :auto-upload="false" accept=".html,.htm,.jpg,.jpeg,.png,.zip" :on-change="onDesignChange"><el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入设计稿，或<em>点击选择</em></div><template #tip>Pixso 可上传单个 HTML；Sketch MeaXure 请上传包含 index.html、preview 和 assets 的完整 ZIP 导出包</template></el-upload><el-input v-model="designNote" placeholder="版本说明（可选）" /><div class="design-upload-actions"><el-button v-if="designFiles.length" :disabled="Boolean(busy)" @click="clearPendingDesigns">清空待上传</el-button><el-button v-if="latestDesign" type="danger" plain :icon="Delete" :loading="busy === 'design-clear'" :disabled="Boolean(busy)" @click="clearUploadedDesigns">清空已上传设计稿</el-button><el-button type="primary" :loading="busy === 'design-upload'" :disabled="!designFiles.length || Boolean(busy)" @click="uploadDesigns">确认上传</el-button></div></el-card>
      <el-card shadow="never"><template #header><div><span class="eyebrow">COMPETITOR INPUT · OPTIONAL</span><h2>竞品材料</h2></div></template><el-input v-model="featureName" placeholder="参考竞品的功能名称" /><el-upload drag multiple :auto-upload="false" accept=".xlsx,.xls,.png,.jpg,.jpeg" :on-change="onCompetitorChange"><el-icon class="el-icon--upload"><Files /></el-icon><div class="el-upload__text">上传表格或图片材料</div></el-upload><el-button type="primary" plain :loading="busy === 'competitor-upload'" :disabled="!competitorFiles.length || !featureName" @click="uploadCompetitors">上传并识别</el-button></el-card>
    </div>

    <el-card v-if="latestDesign" shadow="never" class="design-preview-card"><template #header><div class="card-header"><div><span class="eyebrow">DESIGN VERSION V{{ latestDesign.versionNo }}</span><h2>设计稿预览</h2></div><el-tag type="success">已就绪</el-tag></div></template>
      <div class="review-launch-bar"><div class="review-launch-copy"><el-icon><MagicStick /></el-icon><div><strong>追加 UI 专家评审</strong><p>启用后调用 review-ui-design，补充视觉、交互、设计系统和无障碍检查。</p></div></div><div class="review-launch-actions"><el-switch v-model="useReviewUiDesign" :disabled="Boolean(busy)" active-text="启用 review-ui-design" /><el-button type="primary" :icon="DocumentChecked" :loading="busy === 'review'" :disabled="Boolean(busy)" @click="runReview">{{ busy === 'review' ? '评审进行中' : '发起新一轮评审' }}</el-button></div></div>
      <el-alert v-if="reviewFeedback" :type="reviewFeedback.type" :title="reviewFeedback.title" :description="busy === 'review' ? `${reviewFeedback.description} 已等待 ${reviewElapsedSeconds} 秒。` : reviewFeedback.description" :closable="busy !== 'review'" show-icon class="review-progress-alert" @close="reviewFeedback = null" />
      <div class="design-preview-grid"><el-card v-for="file in latestDesign.files" :key="file.id" shadow="never" :class="{ 'is-html-design': file.extension.includes('htm') }"><DesignPreviewFrame v-if="file.extension.includes('htm')" :src="`/api/design-files/${encodeURIComponent(file.id)}/preview`" :title="file.name" /><el-image v-else :src="file.url" :preview-src-list="latestDesign.files.filter(item => !item.extension.includes('htm')).map(item => item.url)" fit="contain" /><div class="file-caption">{{ file.order }}. {{ file.name }}</div></el-card></div></el-card>

    <el-empty v-if="!latestDesign" description="请先上传设计稿，再发起评审" />

    <template v-if="review">
      <el-card shadow="never" class="review-summary-card"><template #header><div class="card-header"><div><span class="eyebrow">REVIEW OVERVIEW · V{{ review.versionNo }}</span><h2>评审意见总览</h2><p>汇总本轮评审结论、风险和意见处理进度。</p></div><el-space><el-tag v-if="review.uiDesignReviewEnabled" :type="review.baseReviewStatus === 'partial' ? 'warning' : review.uiDesignReviewStatus === 'completed' ? 'success' : 'danger'">{{ review.baseReviewStatus === 'partial' ? 'UI 专家评审待执行' : `UI 专家评审${review.uiDesignReviewStatus === 'completed' ? '已完成' : '失败'}` }}</el-tag><el-tag :type="review.saved ? 'success' : 'warning'">{{ review.saved ? '已保存 · 不可修改' : '临时结果' }}</el-tag><el-tag>{{ conclusionLabel[review.validationConclusion] }}</el-tag></el-space></div></template>
        <div class="review-overview-grid"><div><span>意见总数</span><strong>{{ review.issues.length }}</strong></div><div><span>待处理</span><strong>{{ reviewOverview.pending }}</strong></div><div><span>已采纳 / 部分采纳</span><strong>{{ reviewOverview.accepted + reviewOverview.partial }}</strong></div><div><span>高风险意见</span><strong>{{ reviewOverview.highRisk }}</strong></div></div>
        <el-descriptions :column="4" border><el-descriptions-item label="需求证据">{{ review.requirementEvidenceMode === 'analyzed' ? `需求解析 V${review.analysisVersionNo}` : '完整需求原文' }}</el-descriptions-item><el-descriptions-item label="设计版本">V{{ review.designVersionNo }}</el-descriptions-item><el-descriptions-item label="已处理">{{ processedCount }} / {{ review.issues.length }}</el-descriptions-item><el-descriptions-item label="基础评审 Skill">{{ review.skillVersion }}</el-descriptions-item><el-descriptions-item v-if="review.experienceSkillVersion" label="体验验证 Skill">{{ review.experienceSkillVersion }}</el-descriptions-item><el-descriptions-item label="UI 专家评审">{{ !review.uiDesignReviewEnabled ? '未启用' : review.uiDesignReviewStatus === 'completed' ? `${review.uiDesignReviewSkillVersion} · ${uiDesignReviewIssueCount} 条` : '执行失败' }}</el-descriptions-item></el-descriptions>
        <el-progress :percentage="review.issues.length ? Math.round(processedCount / review.issues.length * 100) : 0" :stroke-width="10" />
      </el-card>

      <el-alert v-if="review.baseReviewStatus === 'partial'" type="warning" title="本轮评审已部分完成" :description="`已保留成功页面的评审结果。失败页面：${review.failedReviewPages.join('、')}。${review.baseReviewError}`" :closable="false" show-icon>
        <template #default><el-button type="warning" plain :icon="Refresh" :loading="busy === 'retry-review-pages'" :disabled="Boolean(busy)" @click="retryReviewPages">只重试失败页面</el-button></template>
      </el-alert>

      <el-card v-if="review.requirementEvidenceMode === 'raw' && review.experienceSkillVersion" shadow="never" class="ui-review-result-card"><template #header><div class="card-header"><div><span class="eyebrow">VALIDATE-USER-EXPERIENCE</span><h2>用户体验验证摘要</h2><p>{{ review.experienceValidationSummary }}</p></div><el-tag :type="review.validationConclusion === 'not_passed' ? 'danger' : review.validationConclusion === 'passed' ? 'success' : 'warning'">{{ conclusionLabel[review.validationConclusion] }}</el-tag></div></template><div class="ui-review-insights"><section v-if="review.experiencePositiveEvidence.length"><strong>正向证据</strong><ul><li v-for="item in review.experiencePositiveEvidence" :key="item">{{ item }}</li></ul></section><section v-if="review.experienceGaps.length"><strong>证据缺口</strong><ul><li v-for="item in review.experienceGaps" :key="item">{{ item }}</li></ul></section><section v-if="review.experienceRetest.length"><strong>复测清单</strong><ul><li v-for="item in review.experienceRetest" :key="item">{{ item }}</li></ul></section></div></el-card>

      <el-alert v-if="review.baseReviewStatus !== 'partial' && review.uiDesignReviewStatus === 'failed'" :title="`review-ui-design 执行失败：${review.uiDesignReviewError}`" description="基础设计评审结果已保留，可检查 Skill 安装或模型配置后重新发起评审。" type="warning" :closable="false" show-icon />
      <el-card v-else-if="review.uiDesignReviewStatus === 'completed'" shadow="never" class="ui-review-result-card"><template #header><div class="card-header"><div><span class="eyebrow">REVIEW-UI-DESIGN</span><h2>UI 专家评审摘要</h2><p>{{ review.uiDesignReviewSummary }}</p></div><el-tag type="success">{{ uiDesignReviewIssueCount }} 条意见</el-tag></div></template><div class="ui-review-insights"><section v-if="review.uiDesignReviewStrengths.length"><strong>值得保留</strong><ul><li v-for="item in review.uiDesignReviewStrengths" :key="item">{{ item }}</li></ul></section><section v-if="review.uiDesignReviewEvidenceLimitations.length"><strong>证据限制</strong><ul><li v-for="item in review.uiDesignReviewEvidenceLimitations" :key="item">{{ item }}</li></ul></section><section v-if="review.uiDesignReviewOpenQuestions.length"><strong>待确认项</strong><ul><li v-for="item in review.uiDesignReviewOpenQuestions" :key="item">{{ item }}</li></ul></section></div></el-card>

      <el-alert v-if="review.baseReviewStatus !== 'partial' && review.competitorStatus === 'failed'" :title="review.competitorError" type="warning" :closable="false" show-icon><template #default><el-button v-if="!review.saved" size="small" :icon="Refresh" :loading="busy === 'retry-competitor'" @click="task('retry-competitor', () => api.retryCompetitor(requirement!.id, review!.id), '竞品对比已更新')">重试竞品对比</el-button></template></el-alert>

      <div class="review-view-switch"><div><span class="eyebrow">REVIEW RESULT VIEW</span><h2>评审结果</h2><p>默认使用列表视图，也可以切换到页面视图查看问题在设计稿中的位置。</p></div><el-radio-group v-model="resultView"><el-radio-button value="list">列表视图</el-radio-button><el-radio-button value="page">页面视图</el-radio-button></el-radio-group></div>

      <el-card v-if="resultView === 'list'" shadow="never" class="issue-workbench"><template #header><div class="card-header"><div><span class="eyebrow">REVIEW OPINIONS</span><h2>评审意见</h2></div><el-tag>{{ filteredIssues.length }} / {{ review.issues.length }} 条</el-tag></div></template><div class="issue-toolbar"><el-input v-model="issueQuery" clearable placeholder="搜索评审问题" /><el-checkbox v-model="pendingOnly">仅看未处理</el-checkbox></div><div class="issue-layout"><el-menu :default-active="activeIssue?.id" class="issue-menu" @select="selectIssue"><el-menu-item v-for="(issue, index) in filteredIssues" :key="issue.id" :index="issue.id"><span class="issue-status-dot" :class="issue.disposition === 'pending' ? 'is-pending' : 'is-processed'" /><span class="issue-index">{{ String(index + 1).padStart(2, '0') }}</span><span class="issue-menu-text">{{ issue.title }}</span></el-menu-item></el-menu>
        <IssueEditor v-if="activeIssue" :key="activeIssue.id" :issue="activeIssue" :readonly="review.saved" :loading="busy === activeIssue.id" @save="body => updateIssue(activeIssue!, body)" /><el-empty v-else description="没有匹配的问题" /></div></el-card>
      <ReviewPageView v-else :files="latestDesign?.files || []" :issues="review.issues" :active-issue-id="activeIssue?.id || ''" :readonly="review.saved" :loading="busy" @select="selectIssue" @save="updateIssue" />

      <el-card v-if="!review.saved" shadow="never" class="review-actions"><div><strong>本轮已处理 {{ processedCount }} / {{ review.issues.length }} 条</strong><p>{{ review.baseReviewStatus === 'partial' ? '请先完成失败页面重试，再保存本轮评审。' : '保存后将成为不可修改的版本快照。' }}</p></div><el-space><el-button type="danger" plain :icon="Delete" :loading="busy === 'discard-review'" @click="discardReview">不保存并放弃</el-button><el-button type="primary" :icon="Check" :loading="busy === 'save-review'" :disabled="review.baseReviewStatus === 'partial' || Boolean(busy)" @click="saveReview">保存评审记录</el-button></el-space></el-card>
    </template>
  </template>
</template>
