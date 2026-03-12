<template>
  <div v-if="visible" class="loading-overlay" :class="{ hidden: hiding }">
    <div>
      <div class="loading-spinner" :class="loadingState" :style="ringStyle" />
      <div class="loading-text">{{ displayText }}</div>
      <div v-if="loadingState === 'rendering'" class="loading-percentage">{{ percentage }}%</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LoadingState } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  state: LoadingState
  alpha: number
  error: string
}>()

const visible = ref(true)
const hiding = ref(false)

const loadingState = computed(() => props.error ? 'fetching' : props.state)

const displayText = computed(() => {
  if (props.error) return props.error
  switch (props.state) {
    case 'fetching': return t('loading.fetching')
    case 'parsing': return t('loading.parsing')
    case 'rendering': return t('loading.rendering')
  }
})

const percentage = computed(() => {
  let p = Math.max(0, Math.min(100, Math.round((1 - props.alpha) * 100)))
  if (p >= 98) p = 100
  return p
})

const ringStyle = computed(() => {
  if (loadingState.value !== 'rendering') return {}
  const angle = (percentage.value / 100) * 360
  return {
    background: `conic-gradient(from 0deg, #ce8815 0deg, #ce8815 ${angle}deg, transparent ${angle}deg)`,
  }
})

function finish() {
  hiding.value = true
  setTimeout(() => { visible.value = false }, 500)
}

defineExpose({ finish })
</script>
