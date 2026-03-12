<template>
  <div class="header-container">
    <div class="metadata">
      <div v-if="ready" class="toolbar-icons">
        <a :href="DN42.homeUrl" target="_blank" class="toolbar-icon" data-tooltip="DN42 Home" aria-label="DN42 Home">
          <img src="/assets/icons/dn42.svg" alt="DN42 Home" width="20" height="20">
        </a>
        <a :href="DN42.peerFinderUrl" target="_blank" class="toolbar-icon" data-tooltip="DN42 Peer Finder" aria-label="DN42 Peer Finder">
          <img src="/assets/icons/peerfinder.svg" alt="DN42 Peer Finder" width="20" height="20">
        </a>
        <a :href="DN42.routeGraphsUrl" target="_blank" class="toolbar-icon" data-tooltip="Route Graph by highdef" aria-label="Route Graph by highdef">
          <img src="/assets/icons/routegraph.svg" alt="Route Graph" width="20" height="20">
        </a>
        <a :href="DN42.toolboxUrl" target="_blank" class="toolbar-icon" data-tooltip="Tools by Kioubit" aria-label="Tools by Kioubit">
          <img src="/assets/icons/tools.svg" alt="Tools" width="20" height="20">
        </a>
        <a :href="DN42.rawJsonApiUrl" target="_blank" class="toolbar-icon" data-tooltip="API Services" aria-label="API Services">
          <img src="/assets/icons/api.svg" alt="API" width="20" height="20">
        </a>
        <a class="toolbar-icon" data-tooltip="All active nodes and ranking" aria-label="All active nodes and ranking" @click="$emit('toggleRanking')">
          <img src="/assets/icons/ranking.svg" alt="Ranking" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="`Time Machine (Date of current map: ${mrtDate})`" aria-label="Time Machine" @click="$emit('openTimeMachine')">
          <img src="/assets/icons/time.svg" alt="Time Machine" width="20" height="20">
        </a>
        <a v-if="showAfFilter" class="toolbar-icon toolbar-af-text" :data-tooltip="afTooltip" :aria-label="afTooltip" @click="$emit('cycleAf')">
          <span v-if="afFilter === 4 || afFilter === 8" class="af-mcast" v-html="afLabel" />
          <template v-else>{{ afLabel }}</template>
        </a>
      </div>
      <template v-else>Loading...</template>
    </div>
    <div v-if="ready" class="search-container">
      <input
        ref="searchInputRef"
        class="search-input"
        type="text"
        placeholder="ASN / Name..."
        @keydown.enter="onSearch"
      >
      <button @click="onSearch">Search</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DN42 } from '@/constants'
import { AF_LABELS, AF_TOOLTIPS } from '@/stores/mapStore'
import type { AfFilter } from '@/types'

const props = defineProps<{
  ready: boolean
  mrtDate: string
  mapVersion: number
  afFilter: AfFilter
}>()

const emit = defineEmits<{
  toggleRanking: []
  openTimeMachine: []
  cycleAf: []
  search: [query: string]
}>()

const searchInputRef = ref<HTMLInputElement>()

const showAfFilter = computed(() => props.mapVersion >= 2)
const afLabel = computed(() => {
  const label = AF_LABELS[props.afFilter]
  if (props.afFilter === 4) return '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv4</span>'
  if (props.afFilter === 8) return '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv6</span>'
  return label
})
const afTooltip = computed(() => AF_TOOLTIPS[props.afFilter])

function onSearch() {
  const value = searchInputRef.value?.value?.trim()
  if (value) emit('search', value)
}

defineExpose({ searchInputRef })
</script>
