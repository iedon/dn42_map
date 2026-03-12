<template>
  <div v-if="data" class="myip">
    <img v-if="data.country" :src="`/assets/flags/${data.country.toLowerCase()}.svg`" width="16" height="16" :alt="data.ip">&nbsp;&nbsp;
    <a v-if="data.ip" :href="DN42.myIpUrl" target="_blank">{{ data.ip }}</a>&nbsp;/&nbsp;
    <span v-if="data.netname">{{ data.netname }}&nbsp;</span>
    <a v-if="data.origin" @click="$emit('navigateAsn', originAsn)">({{ data.origin }})</a>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { DN42 } from '@/constants'
import { fetchMyIpData } from '@/api'
import type { MyIpData } from '@/types'

const emit = defineEmits<{
  navigateAsn: [asn: number]
}>()

const data = ref<MyIpData | null>(null)

const originAsn = computed(() => {
  if (!data.value?.origin) return 0
  return Number(data.value.origin.replace('AS', ''))
})

onMounted(async () => {
  if (!DN42.accessingFromDn42) return
  try {
    data.value = await fetchMyIpData()
  } catch (e) {
    console.error('Failed to get source IP information.', e)
  }
})
</script>
