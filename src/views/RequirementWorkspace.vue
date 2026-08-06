<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ChatDotRound, Clock, Document, EditPen, FullScreen, Picture, Refresh, StarFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '../api'
import type { AnalysisProgress, AnalysisVersion, PendingItem, Requirement } from '../types'

const props = defineProps<{ requirementId: string }>()
const emit = defineEmits<{ back: []; refresh: [] }>()
const requirement = ref<Requirement | null>(null)
const tab = ref('analysis')
const busy = ref('')
const sourceText = ref('')
const answeringId = ref('')
const answerDraft = ref('')
const feedbackOpen = ref(false)
const feedback = ref({ category: '', target: '', description: '', expectedResult: '', generalizable: true })
let timer: number | undefined

const current = computed(() => requirement.value?.analysisVersions.find(item => item.id === requirement.value?.currentAnalysisVersionId))
const openItems = computed(() => current.value?.pendingItems.filter(item => item.status === 'open') || [])
const wireframe = computed(() => current.value?.wireframe)
const createInitialProgress = (): AnalysisProgress => ({
  status: 'running',
  percent: 2,
  title: '正在准备需求解析',
  detail: '系统已接收解析请求，正在读取需求原文并准备结构化分析。',
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  steps: [
    ['source', '原文读取与编号', '读取段落、表格、图片、批注和嵌入附件'],
    ['requirement', '需求结构解析', '生成业务泳道、A-F 分层、页面流程和逐页详情'],
    ['design', '设计要点归纳', '汇总跨页面约束、阻塞问题和全部页面风险'],
    ['competitor', '同类竞品分析', '整理竞品功能矩阵、证据和设计启示'],
    ['assemble', 'HTML 组装', '渲染设计师视角的交互式分析页面'],
    ['validate', '完整度校验', '检查原文覆盖、页面对应关系和流程图'],
  ].map(([id, label, description]) => ({ id, label, description, status: 'pending' as const })),
})

async function load() {
  requirement.value = (await api.getRequirement(props.requirementId)).requirement
  sourceText.value = requirement.value.source.text
}

async function task(name: string, action: () => Promise<{ requirement: Requirement }>, message: string) {
  busy.value = name
  try {
    requirement.value = (await action()).requirement
    emit('refresh')
    ElMessage.success(message)
  } catch (error) { ElMessage.error((error as Error).message) } finally { busy.value = '' }
}

async function analyze() {
  if (!requirement.value) return
  const previous = requirement.value
  const isReanalysis = Boolean(current.value)
  tab.value = 'analysis'
  busy.value = 'analyze'
  requirement.value = { ...previous, status: 'analyzing', analysisProgress: createInitialProgress() }
  ElMessage.info(isReanalysis ? '已开始重新解析，请查看实时进度' : '已开始解析，请查看实时进度')
  try {
    requirement.value = (await api.analyze(previous.id, isReanalysis ? '根据设计师反馈重新解析' : '首次解析')).requirement
    emit('refresh')
    ElMessage.success(isReanalysis ? '已生成新的解析版本' : '需求解析完成')
  } catch (error) {
    requirement.value = previous
    ElMessage.error((error as Error).message)
  } finally {
    busy.value = ''
  }
}

async function saveSource() {
  if (!requirement.value) return
  await task('source', () => api.saveSource(requirement.value!.id, sourceText.value), '需求原文已保存')
}

function startAnswer(item: PendingItem) {
  answeringId.value = item.id
  answerDraft.value = item.answer || ''
}

function cancelAnswer() {
  answeringId.value = ''
  answerDraft.value = ''
}

async function updatePending(item: PendingItem, status: 'answered' | 'ignored') {
  if (!requirement.value) return
  const answer = status === 'answered' ? answerDraft.value.trim() : ''
  if (status === 'answered' && !answer) return
  await task(item.id, () => api.updatePending(requirement.value!.id, item.id, { status, answer }), '待确认项已更新')
  if (status === 'answered') cancelAnswer()
}

async function restore(version: AnalysisVersion) {
  if (!requirement.value) return
  await ElMessageBox.confirm(`将基于 V${version.versionNo} 创建一个新的恢复版本，是否继续？`, '恢复历史版本', { type: 'warning' })
  await task(version.id, () => api.restoreVersion(requirement.value!.id, version.id), `已从 V${version.versionNo} 创建恢复版本`)
}

async function submitFeedback() {
  if (!requirement.value) return
  await task('feedback', () => api.submitAnalysisFeedback(requirement.value!.id, feedback.value), '解析反馈已记录')
  feedbackOpen.value = false
}

async function generateWireframe() {
  if (!requirement.value || !current.value) return
  ElMessage.info('正在调用 wireframe-design 生成线稿，请稍候')
  await task('wireframe', () => api.generateWireframe(requirement.value!.id), '线稿已生成')
  tab.value = 'wireframe'
}

function openWireframe(file: { name: string; svg: string }) {
  const page = window.open('', '_blank')
  if (!page) return ElMessage.error('浏览器阻止了新页面，请允许弹窗后重试')
  page.document.write(`<title>${file.name}</title><iframe sandbox style="width:100%;height:100vh;border:0" srcdoc="${file.svg.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`)
  page.document.close()
}

function openAnalysis() {
  if (!current.value || !requirement.value) return
  const page = window.open('', '_blank')
  if (!page) return ElMessage.error('浏览器阻止了新页面，请允许弹窗后重试')
  page.document.write(`<title>${requirement.value.productName} · 需求解析 V${current.value.versionNo}</title><iframe sandbox="allow-scripts" style="width:100%;height:100vh;border:0" srcdoc="${current.value.html.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe>`)
  page.document.close()
}

watch(() => requirement.value?.status, status => {
  if (timer) window.clearInterval(timer)
  if (status === 'analyzing') timer = window.setInterval(load, 1200)
})
onMounted(load)
onBeforeUnmount(() => timer && window.clearInterval(timer))
</script>

<template>
  <div v-if="!requirement" class="workspace-loading"><el-skeleton :rows="8" animated /></div>
  <template v-else>
    <el-button link :icon="ArrowLeft" @click="emit('back')">返回需求列表</el-button>
    <div class="workspace-title">
      <div><el-space><h1>{{ requirement.productName }}</h1><el-tag :type="requirement.status === 'analyzed' ? 'success' : requirement.status === 'analyzing' ? 'warning' : 'info'">{{ requirement.status === 'analyzed' ? '已解析' : requirement.status === 'analyzing' ? '解析中' : '待解析' }}</el-tag></el-space><p>{{ requirement.summary }}</p><el-space wrap><el-tag effect="plain">产品版本 {{ requirement.version }}</el-tag><el-tag effect="plain">解析 V{{ current?.versionNo || 0 }}</el-tag><el-tag effect="plain">{{ openItems.length }} 个待确认问题</el-tag></el-space></div>
      <el-button type="primary" :icon="StarFilled" :loading="busy === 'analyze' || requirement.status === 'analyzing'" @click="analyze">{{ current ? '重新解析' : '开始解析' }}</el-button>
    </div>

    <el-tabs v-model="tab" class="workspace-tabs">
      <el-tab-pane name="source"><template #label><el-icon><EditPen /></el-icon>需求原文</template>
        <el-card shadow="never"><template #header><div class="card-header"><div><span class="eyebrow">SOURCE DOCUMENT</span><h2>{{ requirement.requirementName || `${requirement.productName}需求原文` }}</h2></div><el-button type="primary" plain :loading="busy === 'source'" :disabled="sourceText === requirement.source.text" @click="saveSource">保存原文</el-button></div></template><el-input v-model="sourceText" type="textarea" :autosize="{ minRows: 20, maxRows: 34 }" /><el-alert class="section-alert" title="修改原文不会覆盖历史解析结果；重新解析会生成新版本。" type="info" :closable="false" show-icon /></el-card>
      </el-tab-pane>

      <el-tab-pane name="analysis"><template #label><el-icon><Document /></el-icon>解析结果</template>
        <el-card v-if="requirement.status === 'analyzing'" shadow="never"><el-result icon="info" :title="requirement.analysisProgress?.title || '正在解析需求'" :sub-title="requirement.analysisProgress?.detail"><template #extra><el-progress :percentage="requirement.analysisProgress?.percent || 2" :stroke-width="12" striped striped-flow /></template></el-result><el-steps :active="requirement.analysisProgress?.steps.filter(step => step.status === 'completed').length || 0" align-center><el-step v-for="step in requirement.analysisProgress?.steps" :key="step.id" :title="step.label" :description="step.description" /></el-steps></el-card>
        <el-empty v-else-if="!current" description="还没有解析结果"><el-button type="primary" @click="analyze">开始解析</el-button></el-empty>
        <div v-else class="analysis-grid">
          <el-card shadow="never"><template #header><div class="card-header"><div><span class="eyebrow">ANALYSIS V{{ current.versionNo }}</span><h2>设计师需求解析 HTML</h2></div><el-space><el-button :icon="FullScreen" type="primary" @click="openAnalysis">新页面查看</el-button><el-button :icon="ChatDotRound" @click="feedbackOpen = true">反馈解析结果</el-button></el-space></div></template><iframe class="analysis-frame" title="需求解析结果" :srcdoc="current.html" sandbox="allow-scripts" /></el-card>
          <el-space direction="vertical" fill size="large"><el-card shadow="never"><template #header>当前版本</template><el-descriptions :column="1" border><el-descriptions-item label="版本">V{{ current.versionNo }}</el-descriptions-item><el-descriptions-item label="变更原因">{{ current.changeReason }}</el-descriptions-item><el-descriptions-item label="Skill">{{ current.skillVersion }}</el-descriptions-item><el-descriptions-item label="反馈记录">{{ requirement.analysisFeedback.length }} 条</el-descriptions-item></el-descriptions></el-card><el-card v-if="current.validation" shadow="never"><template #header>完整度校验</template><el-descriptions :column="1" border><el-descriptions-item label="页面详情">{{ current.validation.pageCount }} 页</el-descriptions-item><el-descriptions-item label="业务节点">{{ current.validation.businessFlowNodeCount }} 个</el-descriptions-item><el-descriptions-item label="页面连线">{{ current.validation.pageFlowEdgeCount }} 条</el-descriptions-item><el-descriptions-item label="未映射">{{ current.validation.unmappedCount }} 条</el-descriptions-item></el-descriptions></el-card></el-space>
        </div>
      </el-tab-pane>

      <el-tab-pane name="pending"><template #label><el-badge :value="openItems.length" :hidden="!openItems.length"><el-icon><ChatDotRound /></el-icon>待确认项</el-badge></template>
        <el-card shadow="never"><el-collapse accordion><el-collapse-item v-for="item in current?.pendingItems || []" :key="item.id" :name="item.id"><template #title><el-space><el-tag :type="item.status === 'open' ? 'warning' : 'success'">{{ item.status === 'open' ? '待确认' : item.status === 'answered' ? '已回答' : '已忽略' }}</el-tag><strong>{{ item.title }}</strong></el-space></template><div class="pending-item-content"><p>{{ item.description }}</p><el-alert v-if="item.sourceHint?.trim()" :title="item.sourceHint" type="info" :closable="false" /><p v-if="item.answer"><strong>确认答案：</strong>{{ item.answer }}</p><div v-if="item.status === 'open' && answeringId === item.id" class="pending-answer-editor"><el-input v-model="answerDraft" type="textarea" :rows="4" maxlength="1000" show-word-limit resize="vertical" placeholder="请输入对该待确认项的回答" /><div class="pending-answer-actions"><el-button @click="cancelAnswer">取消</el-button><el-button type="primary" :loading="busy === item.id" :disabled="!answerDraft.trim()" @click="updatePending(item, 'answered')">提交回答</el-button></div></div><el-space v-else-if="item.status === 'open'"><el-button type="primary" :disabled="Boolean(busy)" @click="startAnswer(item)">回答</el-button><el-button :loading="busy === item.id" :disabled="Boolean(busy) && busy !== item.id" @click="updatePending(item, 'ignored')">忽略</el-button></el-space></div></el-collapse-item></el-collapse><el-empty v-if="!current?.pendingItems.length" description="当前没有待确认项" /></el-card>
      </el-tab-pane>

      <el-tab-pane name="wireframe"><template #label><el-icon><Picture /></el-icon>生成线稿</template>
        <el-card shadow="never"><template #header><div class="card-header"><div><span class="eyebrow">WIREFRAME DESIGN</span><h2>需求线稿</h2><p>基于当前需求解析版本生成页面线稿，包含字段、交互和跳转逻辑。</p></div><el-button type="primary" :icon="Picture" :loading="busy === 'wireframe'" :disabled="!current || Boolean(busy)" @click="generateWireframe">{{ wireframe?.files?.length ? '重新生成线稿' : '生成线稿' }}</el-button></div></template>
          <el-empty v-if="!wireframe?.files?.length" description="还没有生成线稿" />
          <div v-else class="wireframe-workspace">
            <el-alert :title="wireframe.summary" type="success" :closable="false" show-icon />
            <div class="wireframe-grid">
              <el-card v-for="file in wireframe.files" :key="file.name" shadow="never" class="wireframe-preview-card"><template #header><div class="card-header"><strong>{{ file.title }}</strong><el-button link type="primary" @click="openWireframe(file)">新页面查看</el-button></div></template><iframe class="wireframe-frame" :title="file.title" :srcdoc="file.svg" sandbox="" /></el-card>
            </div>
            <el-descriptions :column="1" border>
              <el-descriptions-item label="交互逻辑">{{ wireframe.interactions.join('；') || '暂无' }}</el-descriptions-item>
              <el-descriptions-item label="跳转逻辑">{{ wireframe.navigation.map(item => `${item.from} → ${item.to}${item.trigger ? `（${item.trigger}）` : ''}`).join('；') || '暂无' }}</el-descriptions-item>
            </el-descriptions>
            <el-table :data="wireframe.fields" size="small"><el-table-column prop="page" label="页面" width="180" /><el-table-column prop="name" label="字段" width="180" /><el-table-column prop="type" label="类型" width="120" /><el-table-column prop="required" label="必填" width="100" /><el-table-column prop="description" label="说明" min-width="260" /></el-table>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane name="history"><template #label><el-icon><Clock /></el-icon>版本历史</template>
        <el-card shadow="never"><el-timeline><el-timeline-item v-for="version in [...requirement.analysisVersions].reverse()" :key="version.id" :timestamp="version.createdAt" placement="top"><el-card shadow="never"><div class="card-header"><div><el-space><strong>解析 V{{ version.versionNo }}</strong><el-tag v-if="version.id === requirement.currentAnalysisVersionId" type="success">当前版本</el-tag></el-space><p>{{ version.changeReason }}</p></div><el-button v-if="version.id !== requirement.currentAnalysisVersionId" :icon="Refresh" :loading="busy === version.id" @click="restore(version)">恢复此版本</el-button></div></el-card></el-timeline-item></el-timeline></el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="feedbackOpen" title="反馈解析结果" width="min(620px, 92vw)"><el-form label-position="top"><el-form-item label="问题类别"><el-select v-model="feedback.category" placeholder="请选择"><el-option v-for="item in ['遗漏内容','事实错误','结构问题','待确认项质量','页面或流程问题','其他']" :key="item" :label="item" :value="item" /></el-select></el-form-item><el-form-item label="反馈对象"><el-input v-model="feedback.target" /></el-form-item><el-form-item label="问题描述"><el-input v-model="feedback.description" type="textarea" :rows="4" /></el-form-item><el-form-item label="期望结果"><el-input v-model="feedback.expectedResult" type="textarea" :rows="3" /></el-form-item><el-form-item><el-switch v-model="feedback.generalizable" active-text="可泛化为 Skill 优化样本" /></el-form-item></el-form><template #footer><el-button @click="feedbackOpen = false">取消</el-button><el-button type="primary" :loading="busy === 'feedback'" @click="submitFeedback">提交反馈</el-button></template></el-dialog>
  </template>
</template>
