<script setup lang="ts">
import { computed, ref } from 'vue'
import { Back, Search } from '@element-plus/icons-vue'
import { api } from '../api'
import type { BootstrapData, Requirement } from '../types'
import PageTitle from '../components/PageTitle.vue'

const props = defineProps<{ data: BootstrapData }>()
const product = ref('all')
const query = ref('')
const allRecords = ref(false)
const selectedReviewKey = ref('')
const detailRequirement = ref<Requirement | null>(null)
const records = computed(() => props.data.analytics.products.flatMap(group => group.records.map(record => ({ ...record, productName: group.name, requirementSummary: props.data.requirements.find(item => item.id === record.requirementId)?.requirementName || `需求版本 ${record.requirementVersion}` }))).sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
const filtered = computed(() => records.value.filter(item => (product.value === 'all' || item.productName === product.value) && (!query.value || `${item.productName}${item.requirementSummary}${item.requirementVersion}`.toLowerCase().includes(query.value.toLowerCase()))))
const pendingCount = computed(() => records.value.reduce((total, item) => total + item.opinionCount - item.feedbackCount, 0))
const selectedRecord = computed(() => records.value.find(item => `${item.requirementId}:${item.reviewId}` === selectedReviewKey.value))
const selectedRequirement = computed(() => detailRequirement.value)
const selectedReview = computed(() => selectedRequirement.value?.reviews.find(item => item.id === selectedRecord.value?.reviewId))
const detailOverview = computed(() => {
  const issues = selectedReview.value?.issues || []
  return {
    total: issues.length,
    pending: issues.filter(item => item.disposition === 'pending').length,
    accepted: issues.filter(item => item.disposition === 'accepted').length,
    partial: issues.filter(item => item.disposition === 'partial').length,
    rejected: issues.filter(item => item.disposition === 'rejected').length,
    highRisk: issues.filter(item => item.severity === 'high').length,
  }
})
const dispositionLabel = { pending: '待处理', accepted: '采纳', partial: '部分采纳', rejected: '不采纳', deferred: '待定' }
const conformityLabel = { conforming: '符合', partial: '部分符合', nonconforming: '不符合' }
const severityLabel = { high: '高风险', medium: '中风险', low: '低风险' }
function severityText(value: string) { return severityLabel[value as keyof typeof severityLabel] || ({ 高: '高风险', 中: '中风险', 低: '低风险' }[value] || value || '—') }
function severityType(value: string) { return value === 'high' || value === '高' ? 'danger' : value === 'medium' || value === '中' ? 'warning' : 'success' }
function conformityText(value: string) { return conformityLabel[value as keyof typeof conformityLabel] || value || '—' }
async function openDetail(row: any) {
  detailRequirement.value = (await api.getRequirement(row.requirementId)).requirement
  selectedReviewKey.value = `${row.requirementId}:${row.reviewId}`
  allRecords.value = false
}
function closeDetail() { selectedReviewKey.value = ''; detailRequirement.value = null }
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
</script>

<template>
  <template v-if="selectedReview && selectedRequirement && selectedRecord">
    <PageTitle eyebrow="REVIEW RECORD DETAIL" title="评审记录详情" :description="`${selectedRequirement.productName} · ${selectedRequirement.version}`"><template #actions><el-button :icon="Back" @click="closeDetail">返回评审数据</el-button></template></PageTitle>
    <el-card shadow="never" class="analytics-review-detail"><template #header><div class="card-header"><div><span class="eyebrow">REQUIREMENT</span><h2>{{ selectedRequirement.productName }} · {{ selectedRequirement.version }}</h2><p>{{ selectedRequirement.summary }}</p></div><el-tag type="success">评审 V{{ selectedReview.versionNo }} · 已保存</el-tag></div></template><el-descriptions :column="4" border><el-descriptions-item label="需求名称">{{ selectedRequirement.requirementName }}</el-descriptions-item><el-descriptions-item label="产品">{{ selectedRequirement.productName }}</el-descriptions-item><el-descriptions-item label="产品版本">{{ selectedRequirement.version }}</el-descriptions-item><el-descriptions-item label="保存时间">{{ formatDate(selectedRecord.savedAt) }}</el-descriptions-item></el-descriptions></el-card>
    <el-card shadow="never" class="analytics-review-overview"><template #header><div class="card-header"><div><span class="eyebrow">REVIEW OVERVIEW</span><h2>评审意见总览</h2><p>只读展示本轮已保存评审快照，不包含设计稿和竞品材料操作。</p></div><el-tag>{{ selectedRecord.acceptanceRate }}% 采纳率</el-tag></div></template>
      <div class="review-overview-grid"><div><span>意见总数</span><strong>{{ detailOverview.total }}</strong></div><div><span>待处理</span><strong>{{ detailOverview.pending }}</strong></div><div><span>采纳 / 部分采纳</span><strong>{{ detailOverview.accepted + detailOverview.partial }}</strong></div><div><span>高风险意见</span><strong>{{ detailOverview.highRisk }}</strong></div></div>
      <el-descriptions :column="4" border><el-descriptions-item label="需求证据">{{ selectedReview.requirementEvidenceMode === 'analyzed' ? `需求解析 V${selectedReview.analysisVersionNo}` : '完整需求原文' }}</el-descriptions-item><el-descriptions-item label="设计版本">V{{ selectedReview.designVersionNo }}</el-descriptions-item><el-descriptions-item label="已处理">{{ selectedRecord.feedbackCount }} / {{ selectedRecord.opinionCount }}</el-descriptions-item><el-descriptions-item label="评审 Skill">{{ selectedReview.skillVersion }}</el-descriptions-item></el-descriptions>
      <el-table :data="selectedReview.issues" class="analytics-opinion-table"><el-table-column type="index" label="#" width="56" /><el-table-column label="评审意见" min-width="300"><template #default="{ row }"><strong>{{ row.title }}</strong><div class="cell-subtitle">{{ row.detail }}</div></template></el-table-column><el-table-column prop="type" label="类型" width="150" /><el-table-column label="风险" width="100"><template #default="{ row }"><el-tag :type="severityType(row.severity)">{{ severityText(row.severity) }}</el-tag></template></el-table-column><el-table-column label="符合性" width="110"><template #default="{ row }">{{ conformityText(row.conformity) }}</template></el-table-column><el-table-column label="处理结果" width="110"><template #default="{ row }">{{ dispositionLabel[row.disposition as keyof typeof dispositionLabel] || row.disposition }}</template></el-table-column></el-table>
    </el-card>
  </template>
  <template v-else-if="!allRecords">
    <PageTitle eyebrow="REVIEW ANALYTICS" title="评审数据" />
    <el-alert title="统一统计口径" :description="`本页仅统计已保存的评审记录。综合采纳率＝（采纳＋部分采纳）÷已完成处理意见数；完全采纳率为 ${data.analytics.strictAcceptanceRate}%。待处理和待定不计入采纳率分母。`" type="warning" :closable="false" show-icon />
    <div class="analytics-summary"><el-card shadow="never"><el-statistic title="评审轮次" :value="data.analytics.reviewCount"><template #suffix>轮</template></el-statistic></el-card><el-card shadow="never"><el-statistic title="已保存意见" :value="data.analytics.opinionCount"><template #suffix>条</template></el-statistic></el-card><el-card shadow="never"><el-statistic title="待处理意见" :value="pendingCount"><template #suffix>条</template></el-statistic></el-card><el-card shadow="never"><el-statistic title="综合采纳率" :value="data.analytics.overallAcceptanceRate"><template #suffix>%</template></el-statistic></el-card></div>
    <el-card shadow="never"><template #header><div class="card-header"><div><span class="eyebrow">SAVED REVIEW RECORDS</span><h2>已保存的评审记录</h2><p>按保存时间倒序展示，每一轮都是不可修改的版本快照。</p></div><el-space><el-button v-if="data.user.role === 'admin'" @click="allRecords = true">查看全部评审记录</el-button><el-tag>{{ filtered.length }} / {{ records.length }} 轮</el-tag></el-space></div></template><div class="table-toolbar"><el-select v-model="product" style="width:180px"><el-option label="全部产品" value="all" /><el-option v-for="item in data.analytics.products" :key="item.name" :label="item.name" :value="item.name" /></el-select><el-input v-model="query" :prefix-icon="Search" clearable placeholder="搜索产品或需求" /></div><el-table :data="filtered"><el-table-column label="产品与需求" min-width="250"><template #default="{ row }"><strong>{{ row.productName }} · {{ row.requirementVersion }}</strong><div class="cell-subtitle">{{ row.requirementSummary }}</div></template></el-table-column><el-table-column label="评审快照" width="140"><template #default="{ row }"><strong>评审 V{{ row.reviewVersionNo }}</strong><div class="cell-subtitle">{{ row.requirementEvidenceMode === 'analyzed' ? `需求解析 V${row.analysisVersionNo}` : '原始需求文档' }}</div></template></el-table-column><el-table-column label="设计与竞品" width="150"><template #default="{ row }">设计稿 V{{ row.designVersionNo }}<div class="cell-subtitle">{{ row.competitorFeatureName || '未使用竞品' }}</div></template></el-table-column><el-table-column label="意见处理" width="140"><template #default="{ row }">{{ row.feedbackCount }} / {{ row.opinionCount }} 条<div class="cell-subtitle">{{ row.opinionCount - row.feedbackCount }} 条待处理</div></template></el-table-column><el-table-column label="采纳率" width="100"><template #default="{ row }"><el-progress type="circle" :percentage="row.acceptanceRate" :width="54" :stroke-width="5" /></template></el-table-column><el-table-column label="保存信息" width="140"><template #default="{ row }">{{ formatDate(row.savedAt) }}<div class="cell-subtitle">{{ row.createdBy }}</div></template></el-table-column><el-table-column width="90" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row)">查看</el-button></template></el-table-column></el-table></el-card>
    <div class="analytics-insights"><el-card shadow="never"><template #header><div><span class="eyebrow">TRENDS & INSIGHTS</span><h2>逐轮评审趋势</h2></div></template><div class="trend-list"><div v-for="item in records" :key="item.reviewId"><div class="trend-meta"><strong>{{ item.productName }} · V{{ item.reviewVersionNo }}</strong><span>{{ item.feedbackCount }}/{{ item.opinionCount }} 条</span></div><el-progress :percentage="item.acceptanceRate" /></div></div></el-card><el-card shadow="never"><template #header><div><span class="eyebrow">PRODUCT INSIGHTS</span><h2>产品对比</h2></div></template><div class="product-list"><div v-for="item in data.analytics.products" :key="item.name"><div class="trend-meta"><strong>{{ item.name }}</strong><span>{{ item.reviewCount }} 轮 · {{ item.accepted }}/{{ item.total }} 条</span></div><el-progress :percentage="item.total ? Math.round(item.accepted / item.total * 100) : 0" /></div></div></el-card></div>
  </template>
  <template v-else><PageTitle eyebrow="ALL REVIEW RECORDS" title="全部评审记录" description="展示所有已生成的评审，不论是否保存。"><template #actions><el-button :icon="Back" @click="allRecords = false">返回评审数据</el-button></template></PageTitle><el-card shadow="never"><el-table :data="data.analytics.allRecords"><el-table-column prop="productName" label="产品" width="120" /><el-table-column label="需求与评审" min-width="300"><template #default="{ row }"><strong>{{ row.requirementSummary }}</strong><div class="cell-subtitle">{{ row.requirementVersion }} · 评审 V{{ row.reviewVersionNo }}</div></template></el-table-column><el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.state === 'saved' ? 'success' : row.state === 'draft' ? 'warning' : 'info'">{{ row.state === 'saved' ? '已保存' : row.state === 'draft' ? '临时未保存' : '已放弃' }}</el-tag></template></el-table-column><el-table-column prop="opinionCount" label="意见数" width="90" /><el-table-column prop="feedbackCount" label="已处理" width="90" /><el-table-column width="100"><template #default="{ row }"><el-button v-if="row.state === 'saved'" link type="primary" @click="openDetail(row)">查看快照</el-button></template></el-table-column></el-table></el-card></template>
</template>
