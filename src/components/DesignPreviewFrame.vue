<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

defineProps<{
  src: string
  title: string
}>()

const frame = ref<HTMLIFrameElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const height = ref(420)
const loading = ref(true)
const failed = ref(false)
let resizeObserver: ResizeObserver | null = null
let resizeTimer = 0

function fitContent() {
  const element = frame.value
  const document = element?.contentDocument
  if (!element || !document?.documentElement || !viewport.value) return

  const root = document.documentElement
  root.style.removeProperty('zoom')
  const naturalWidth = Math.max(root.scrollWidth, document.body?.scrollWidth || 0, 1)
  const naturalHeight = Math.max(root.scrollHeight, document.body?.scrollHeight || 0, 1)
  const availableWidth = Math.max(viewport.value.clientWidth, 1)
  const scale = Math.min(1, availableWidth / naturalWidth)

  root.style.setProperty('zoom', String(scale))
  height.value = Math.min(720, Math.max(360, Math.ceil(naturalHeight * scale)))
}

function scheduleFit() {
  window.clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(fitContent, 80)
}

async function onLoad() {
  loading.value = false
  failed.value = false
  await nextTick()
  fitContent()
  window.setTimeout(fitContent, 300)
  window.setTimeout(fitContent, 1000)

  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(scheduleFit)
  if (viewport.value) resizeObserver.observe(viewport.value)
}

function onError() {
  loading.value = false
  failed.value = true
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.clearTimeout(resizeTimer)
})
</script>

<template>
  <div ref="viewport" class="design-html-preview" :class="{ 'is-loading': loading }">
    <iframe
      ref="frame"
      :src="src"
      :title="title"
      :style="{ height: `${height}px` }"
      scrolling="auto"
      @load="onLoad"
      @error="onError"
    />
    <div v-if="loading" class="design-html-preview__status">正在加载设计稿…</div>
    <div v-else-if="failed" class="design-html-preview__status is-error">设计稿预览加载失败</div>
  </div>
</template>
