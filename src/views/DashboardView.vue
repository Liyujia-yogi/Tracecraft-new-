<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight, Checked, Document, Plus, Promotion } from '@element-plus/icons-vue'
import type { BootstrapData } from '../types'

const props = defineProps<{ data: BootstrapData }>()
const emit = defineEmits<{ navigate: [view: 'requirements' | 'review']; 'open-requirement': [id: string] }>()

const pendingTotal = computed(() => props.data.requirements.reduce((total, item) => total + item.pendingCount, 0))
const reviewReadyCount = computed(() => props.data.requirements.filter((item) => item.designVersion > 0 && item.reviewStatus !== 'completed').length)
const latestRequirement = computed(() => props.data.requirements[0])
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const openRow = (row: BootstrapData['requirements'][number]) => emit('open-requirement', row.id)
</script>

<template>
  <el-card class="hero-card" shadow="never">
    <div class="hero-copy">
      <el-space wrap><el-tag type="success" round><el-icon><Promotion /></el-icon>工作台在线</el-tag><el-tag round>{{ latestRequirement ? `更新于 ${formatDate(latestRequirement.updatedAt)}` : '暂无更新时间' }}</el-tag></el-space>
      <div class="hero-intro">
        <h1>TRACECRAFT</h1>
        <p>面向产品与设计团队的需求解析和设计评审平台。串联需求证据、版本、评审意见与反馈闭环，让每一次设计决策都有依据、可追溯。</p>
      </div>
      <el-space wrap>
        <el-button type="primary" size="large" :icon="Plus" @click="emit('navigate', 'requirements')">上传需求</el-button>
        <el-button size="large" :icon="Checked" @click="emit('navigate', 'review')">进入设计评审</el-button>
      </el-space>
    </div>
    <el-statistic title="待评审" :value="reviewReadyCount"><template #suffix>项</template></el-statistic>
  </el-card>

  <div class="dashboard-grid">
    <el-card shadow="never">
      <template #header><div class="card-header"><div><span class="eyebrow">RECENT WORK</span><h2>最近需求</h2></div><el-button link type="primary" @click="emit('navigate', 'requirements')">查看全部<el-icon><ArrowRight /></el-icon></el-button></div></template>
      <el-table v-if="data.requirements.length" :data="data.requirements.slice(0, 5)" row-class-name="clickable-row" @row-click="openRow">
        <el-table-column label="需求" min-width="260"><template #default="{ row }"><strong>{{ row.productName }}</strong><div class="cell-subtitle">{{ row.requirementName }}</div></template></el-table-column>
        <el-table-column prop="version" label="产品版本" width="110" />
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="row.status === 'analyzed' ? 'success' : row.status === 'analyzing' ? 'warning' : 'info'">{{ row.status === 'analyzed' ? '已解析' : row.status === 'analyzing' ? '解析中' : '待解析' }}</el-tag></template></el-table-column>
        <el-table-column label="更新时间" width="130"><template #default="{ row }">{{ formatDate(row.updatedAt) }}</template></el-table-column>
      </el-table>
      <el-empty v-else description="还没有需求记录"><el-button type="primary" @click="emit('navigate', 'requirements')">上传第一份需求</el-button></el-empty>
    </el-card>

    <el-card class="workflow-card" shadow="never">
      <template #header><div class="card-header"><div><span class="eyebrow">CLOSED LOOP</span><h2>当前闭环</h2></div><el-tag type="success" round>运行中</el-tag></div></template>
      <el-steps direction="vertical" :active="2" finish-status="success">
        <el-step title="解析需求" description="提取页面、流程与待确认项" />
        <el-step title="确认问题" description="回复或忽略，并生成新版本" />
        <el-step title="评审设计" description="依据需求证据检查设计稿" />
        <el-step title="优化 Skill" description="汇总反馈，审核候选改进" />
      </el-steps>
      <el-alert :title="pendingTotal ? `优先处理 ${pendingTotal} 项待确认问题` : '当前没有阻塞事项'" type="info" :closable="false" show-icon />
    </el-card>
  </div>
</template>
