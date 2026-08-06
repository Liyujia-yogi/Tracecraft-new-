<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Document, Plus, Search, UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'
import { ElMessage } from 'element-plus'
import { api } from '../api'
import type { BootstrapData, RequirementSummary } from '../types'
import PageTitle from '../components/PageTitle.vue'

const props = defineProps<{ data: BootstrapData }>()
const emit = defineEmits<{ refresh: []; open: [id: string] }>()
const query = ref('')
const selected = ref<RequirementSummary[]>([])
const uploadOpen = ref(false)
const deleteOpen = ref(false)
const busy = ref(false)
const uploadFile = ref<File | null>(null)
const form = ref({ productName: '', version: '', requirementName: '' })

const filtered = computed(() => props.data.requirements.filter(item => `${item.productName}${item.requirementName}${item.version}`.toLowerCase().includes(query.value.toLowerCase())))
const statusText = (status: RequirementSummary['status']) => status === 'analyzed' ? '已解析' : status === 'analyzing' ? '解析中' : '待解析'
const formatDate = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

function onFileChange(file: UploadFile) { uploadFile.value = file.raw || null }
function onSelectionChange(rows: RequirementSummary[]) { selected.value = rows }
function onRowClick(row: RequirementSummary) { emit('open', row.id) }

async function createRequirement() {
  if (!uploadFile.value) return ElMessage.warning('请选择 MD 或 DOCX 文件')
  if (!form.value.productName.trim() || !form.value.version.trim() || !form.value.requirementName.trim()) return ElMessage.warning('产品名称、版本号和需求名称不能为空')
  busy.value = true
  try {
    const body = new FormData()
    body.append('file', uploadFile.value)
    body.append('productName', form.value.productName)
    body.append('version', form.value.version)
    body.append('requirementName', form.value.requirementName)
    const result = await api.createRequirement(body)
    emit('refresh')
    uploadOpen.value = false
    ElMessage.success('需求文档已上传')
    emit('open', result.requirement.id)
  } catch (error) { ElMessage.error((error as Error).message) } finally { busy.value = false }
}

async function removeRequirements() {
  busy.value = true
  try {
    const result = await api.deleteRequirements(selected.value.map(item => item.id))
    emit('refresh')
    selected.value = []
    deleteOpen.value = false
    result.cleanupWarnings.length ? ElMessage.warning(`已删除 ${result.deletedCount} 项，部分文件清理失败`) : ElMessage.success(`已删除 ${result.deletedCount} 项`)
  } catch (error) { ElMessage.error((error as Error).message) } finally { busy.value = false }
}
</script>

<template>
  <PageTitle eyebrow="REQUIREMENT ANALYSIS" title="需求解析" description="上传需求材料，生成可追溯的设计分析结果和待确认问题。">
    <template #actions><el-button type="primary" :icon="Plus" @click="uploadOpen = true">上传需求文档</el-button></template>
  </PageTitle>

  <el-card shadow="never">
    <div class="table-toolbar">
      <el-input v-model="query" :prefix-icon="Search" clearable placeholder="搜索产品名称、需求名称或版本" />
      <el-space><el-tag v-if="selected.length" type="info">已选 {{ selected.length }} 项</el-tag><el-button type="danger" plain :icon="Delete" :disabled="!selected.length" @click="deleteOpen = true">批量删除</el-button></el-space>
    </div>
    <el-table :data="filtered" @selection-change="onSelectionChange" @row-click="onRowClick">
      <el-table-column type="selection" width="48" />
      <el-table-column label="产品名称" min-width="180"><template #default="{ row }"><div class="table-primary"><el-icon><Document /></el-icon><strong>{{ row.productName }}</strong></div></template></el-table-column>
      <el-table-column prop="requirementName" label="需求名称" min-width="260" show-overflow-tooltip />
      <el-table-column prop="version" label="产品版本" width="120" />
      <el-table-column label="解析进度" width="140"><template #default="{ row }"><el-tag :type="row.status === 'analyzed' ? 'success' : row.status === 'analyzing' ? 'warning' : 'info'">{{ statusText(row.status) }}</el-tag><div v-if="row.analysisVersion" class="cell-subtitle">解析 V{{ row.analysisVersion }}</div></template></el-table-column>
      <el-table-column label="待确认项" width="110"><template #default="{ row }"><el-text :type="row.pendingCount ? 'warning' : 'info'">{{ row.pendingCount }} 项</el-text></template></el-table-column>
      <el-table-column label="设计评审" width="150"><template #default="{ row }">{{ row.reviewStatus === 'completed' ? '已完成' : row.designVersion ? '待评审' : '未上传设计稿' }}</template></el-table-column>
      <el-table-column label="更新时间" width="130"><template #default="{ row }">{{ formatDate(row.updatedAt) }}</template></el-table-column>
    </el-table>
  </el-card>

  <el-dialog v-model="uploadOpen" title="上传需求文档" width="min(620px, 92vw)" destroy-on-close>
    <el-form label-position="top" :model="form">
      <el-upload drag :auto-upload="false" :limit="1" accept=".md,.markdown,.docx" :on-change="onFileChange"><el-icon class="el-icon--upload"><UploadFilled /></el-icon><div class="el-upload__text">拖入文件，或<em>点击选择</em></div><template #tip>支持 Markdown、Word（DOCX），单文件不超过 20MB</template></el-upload>
      <div class="form-grid"><el-form-item label="产品名称" required><el-input v-model="form.productName" placeholder="例如：云网络控制台" /></el-form-item><el-form-item label="版本号" required><el-input v-model="form.version" placeholder="例如：2026.08" /></el-form-item></div>
      <el-form-item label="需求名称" required><el-input v-model="form.requirementName" maxlength="50" show-word-limit placeholder="例如：新增弹性带宽池配置能力" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="uploadOpen = false">取消</el-button><el-button type="primary" :loading="busy" :disabled="!form.productName.trim() || !form.version.trim() || !form.requirementName.trim()" @click="createRequirement">上传并创建</el-button></template>
  </el-dialog>

  <el-dialog v-model="deleteOpen" title="确认批量删除" width="min(560px, 92vw)">
    <el-alert title="相关需求原文、解析版本、设计稿和评审记录会被一并删除，且不可恢复。" type="error" :closable="false" show-icon />
    <el-scrollbar max-height="220px" class="delete-list"><el-tag v-for="item in selected" :key="item.id" closable :disable-transitions="true">{{ item.productName }} · {{ item.version }}</el-tag></el-scrollbar>
    <template #footer><el-button @click="deleteOpen = false">取消</el-button><el-button type="danger" :loading="busy" @click="removeRequirements">确认删除 {{ selected.length }} 项</el-button></template>
  </el-dialog>
</template>
