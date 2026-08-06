<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { Disposition, ReviewIssue } from '../types'

const props = defineProps<{ issue: ReviewIssue; readonly: boolean; loading: boolean }>()
const emit = defineEmits<{ save: [body: object] }>()
const state = reactive({ disposition: props.issue.disposition as Disposition, conformity: props.issue.conformity, reasonCategory: props.issue.reasonCategory, feedbackReason: props.issue.feedbackReason })
watch(() => props.issue, issue => Object.assign(state, { disposition: issue.disposition, conformity: issue.conformity, reasonCategory: issue.reasonCategory, feedbackReason: issue.feedbackReason }))
const confidenceLabel = { confirmed: '已确认', high: '高置信', medium: '中置信', low: '低置信', needs_review: '待复核', '': '' }
</script>

<template>
  <div class="issue-editor">
    <el-space wrap><el-tag v-if="issue.reviewCode" type="danger">{{ issue.reviewCode }} · {{ issue.reviewPriority }}</el-tag><el-tag>{{ issue.type }}</el-tag><el-tag type="info">{{ issue.process }}</el-tag><el-tag :type="issue.severity === 'high' ? 'danger' : issue.severity === 'medium' ? 'warning' : 'success'">{{ issue.severity === 'high' ? '高风险' : issue.severity === 'medium' ? '中风险' : '低风险' }}</el-tag><el-tag v-if="issue.experienceLevel">{{ issue.experienceLevel }}</el-tag><el-tag v-if="issue.confidence" type="info">{{ confidenceLabel[issue.confidence] }}</el-tag></el-space>
    <h2>{{ issue.title }}</h2><p>{{ issue.detail }}</p>
    <el-descriptions v-if="issue.userPerspective || issue.rootCause" :column="2" border><el-descriptions-item label="用户视角">{{ issue.userPerspective || '—' }}</el-descriptions-item><el-descriptions-item label="根因分析">{{ issue.rootCause || '—' }}</el-descriptions-item><el-descriptions-item label="用户影响">{{ issue.userImpact || '—' }}</el-descriptions-item><el-descriptions-item label="解决方案">{{ issue.solution || '—' }}</el-descriptions-item></el-descriptions>
    <el-descriptions v-if="issue.evidence || issue.verification" :column="2" border><el-descriptions-item label="评审证据">{{ issue.evidence || '—' }}</el-descriptions-item><el-descriptions-item label="修改建议">{{ issue.solution || '—' }}</el-descriptions-item><el-descriptions-item label="验收标准" :span="2">{{ issue.verification || '—' }}</el-descriptions-item></el-descriptions>
    <el-form label-position="top" class="issue-form">
      <div class="form-grid"><el-form-item label="符合性"><el-select v-model="state.conformity" :disabled="readonly || issue.basis === 'competitor'"><el-option label="符合" value="conforming" /><el-option label="部分符合" value="partial" /><el-option label="不符合" value="nonconforming" /></el-select></el-form-item><el-form-item label="处理结果"><el-select v-model="state.disposition" :disabled="readonly"><el-option label="待处理" value="pending" /><el-option label="采纳" value="accepted" /><el-option label="部分采纳" value="partial" /><el-option label="不采纳" value="rejected" /><el-option label="待定" value="deferred" /></el-select></el-form-item></div>
      <el-form-item label="原因类型"><el-select v-model="state.reasonCategory" :disabled="readonly" clearable><el-option v-for="item in ['评审意见判断错误','误解了需求','误解了设计稿','设计稿信息不足','重复意见','分类或流程错误','问题真实但本期不处理','受成本排期限制','其他原因']" :key="item" :label="item" :value="item" /></el-select></el-form-item>
      <el-form-item label="反馈理由"><el-input v-model="state.feedbackReason" :disabled="readonly" type="textarea" :rows="4" /></el-form-item>
      <el-button v-if="!readonly" type="primary" plain :loading="loading" @click="emit('save', { ...state })">暂存反馈</el-button>
    </el-form>
  </div>
</template>
