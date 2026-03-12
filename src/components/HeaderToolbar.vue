<template>
  <div class="header-container">
    <div class="metadata">
      <div v-if="ready" class="toolbar-icons">
        <a :href="DN42.homeUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.dn42Home')" :aria-label="$t('header.dn42Home')">
          <img src="/assets/icons/dn42.svg" :alt="$t('header.dn42Home')" width="20" height="20">
        </a>
        <a :href="DN42.peerFinderUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.peerFinder')" :aria-label="$t('header.peerFinder')">
          <img src="/assets/icons/peerfinder.svg" :alt="$t('header.peerFinder')" width="20" height="20">
        </a>
        <a :href="DN42.routeGraphsUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.routeGraph')" :aria-label="$t('header.routeGraph')">
          <img src="/assets/icons/routegraph.svg" :alt="$t('header.routeGraph')" width="20" height="20">
        </a>
        <a :href="DN42.toolboxUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.tools')" :aria-label="$t('header.tools')">
          <img src="/assets/icons/tools.svg" :alt="$t('header.tools')" width="20" height="20">
        </a>
        <a :href="DN42.rawJsonApiUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.apiServices')" :aria-label="$t('header.apiServices')">
          <img src="/assets/icons/api.svg" :alt="$t('header.apiServices')" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="$t('header.ranking')" :aria-label="$t('header.ranking')" @click="$emit('toggleRanking')">
          <img src="/assets/icons/ranking.svg" :alt="$t('header.ranking')" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="$t('header.timeMachine', { date: mrtDate })" :aria-label="$t('timeMachine.title')" @click="$emit('openTimeMachine')">
          <img src="/assets/icons/time.svg" :alt="$t('timeMachine.title')" width="20" height="20">
        </a>
        <a v-if="showAfFilter" class="toolbar-icon toolbar-af-text" :data-tooltip="afTooltip" :aria-label="afTooltip" @click="$emit('cycleAf')">
          <span v-if="afFilter === 4 || afFilter === 8" class="af-mcast" v-html="afLabel" />
          <template v-else>{{ afLabel }}</template>
        </a>
      </div>
      <template v-else>{{ $t('loading.text') }}</template>
    </div>
    <div v-if="ready" class="search-container">
      <input
        ref="searchInputRef"
        class="search-input"
        type="text"
        :placeholder="$t('header.searchPlaceholder')"
        @keydown.enter="onSearch"
      >
      <button @click="onSearch">{{ $t('header.search') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DN42 } from '@/constants'
import { AF_LABEL_KEYS, AF_TOOLTIP_KEYS } from '@/stores/mapStore'
import type { AfFilter } from '@/types'

const { t } = useI18n()

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
  const label = t(AF_LABEL_KEYS[props.afFilter])
  if (props.afFilter === 4) return '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv4</span>'
  if (props.afFilter === 8) return '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv6</span>'
  return label
})
const afTooltip = computed(() => t(AF_TOOLTIP_KEYS[props.afFilter]))

function onSearch() {
  const value = searchInputRef.value?.value?.trim()
  if (value) emit('search', value)
}

defineExpose({ searchInputRef })
</script>
