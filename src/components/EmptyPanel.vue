<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'
defineProps<{ title: string; description: string }>()
</script>

<template>
  <el-empty :description="description" :image-size="72">
    <template #image><el-icon :size="42" color="#6777e8"><Document /></el-icon></template>
    <strong>{{ title }}</strong>
  </el-empty>
</template>
