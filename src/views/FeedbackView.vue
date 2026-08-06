<script setup lang="ts">
import { ref } from 'vue'
import { CircleCheck, MagicStick, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import type { BootstrapData, OptimizationRun } from '../types'
import PageTitle from '../components/PageTitle.vue'

const props = defineProps<{ data: BootstrapData }>()
const emit = defineEmits<{ refresh: [] }>()
const busy = ref('')
const latest = (type: 'requirement' | 'review') => props.data.optimizationRuns.find(item => item.type === type)
async function run(type: 'requirement' | 'review') {
  busy.value = type
  try { await api.runOptimization(type); emit('refresh'); ElMessage.success('已生成候选 Skill 优化报告') }
  catch (error) { ElMessage.error((error as Error).message) }
  finally { busy.value = '' }
}
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
</script>

<template>
  <PageTitle eyebrow="FEEDBACK OPTIMIZATION" title="反馈优化闭环" description="反馈被结构化记录、汇总和审核，生产 Skill 不会根据单条反馈直接修改自己。" />
  <el-alert title="受控优化原则" description="优化 Skill 只生成候选修改建议和回归案例；经过人工审核和固定回归集验证后，才能发布目标 Skill 新版本。" type="info" :closable="false" show-icon />
  <div class="optimization-grid">
    <el-card v-for="type in (['requirement', 'review'] as const)" :key="type" shadow="never">
      <template #header><div class="card-header"><el-avatar :icon="type === 'requirement' ? MagicStick : CircleCheck" shape="square" /><el-tag effect="plain">目标：{{ type === 'requirement' ? data.settings.requirementSkillVersion : data.settings.reviewSkillVersion }}</el-tag></div></template>
      <h2>{{ type === 'requirement' ? '需求解析反馈优化' : '设计评审反馈优化' }}</h2><p>{{ type === 'requirement' ? '识别遗漏、错误、待确认项质量和跨页面约束问题。' : '区分真实误报、分类错误与有效但暂不处理的意见。' }}</p>
      <el-steps :active="3" simple finish-status="success"><el-step title="结构化反馈" /><el-step title="候选建议" /><el-step title="人工审核" /></el-steps>
      <el-button type="primary" :icon="Promotion" :loading="busy === type" @click="run(type)">生成候选优化报告</el-button>
      <el-card v-if="latest(type)" class="latest-report" shadow="never"><span class="eyebrow">LATEST REPORT</span><strong>{{ latest(type)?.report.overview }}</strong><el-collapse><el-collapse-item title="候选改进"><ul><li v-for="item in latest(type)?.report.recommendations.slice(0, 3)" :key="item">{{ item }}</li></ul></el-collapse-item><el-collapse-item title="发布风险"><ul><li v-for="item in latest(type)?.report.risks.slice(0, 2)" :key="item">{{ item }}</li></ul></el-collapse-item></el-collapse></el-card>
    </el-card>
  </div>
  <el-card shadow="never"><template #header><div><span class="eyebrow">OPTIMIZATION HISTORY</span><h2>候选优化记录</h2></div></template><el-table :data="data.optimizationRuns"><el-table-column label="类型" width="120"><template #default="{ row }"><el-tag>{{ row.type === 'requirement' ? '需求解析' : '设计评审' }}</el-tag></template></el-table-column><el-table-column prop="targetSkill" label="目标 Skill" width="180" /><el-table-column label="报告摘要" min-width="320"><template #default="{ row }">{{ row.report.overview }}</template></el-table-column><el-table-column prop="sampleCount" label="样本数" width="90" /><el-table-column label="生成时间" width="140"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column></el-table></el-card>
</template>
