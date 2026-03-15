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
        <a :href="DN42.toolboxUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.tools')" :aria-label="$t('header.tools')">
          <img src="/assets/icons/tools.svg" :alt="$t('header.tools')" width="20" height="20">
        </a>
        <a :href="DN42.rawJsonApiUrl" target="_blank" class="toolbar-icon" :data-tooltip="$t('header.apiServices')" :aria-label="$t('header.apiServices')">
          <img src="/assets/icons/api.svg" :alt="$t('header.apiServices')" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="`[R] ${t('header.ranking')}`" :aria-label="$t('header.ranking')" @click="$emit('toggleRanking')">
          <img src="/assets/icons/ranking.svg" :alt="$t('header.ranking')" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="$t('header.timeMachine', { date: mrtDate })" :aria-label="$t('timeMachine.title')" @click="$emit('openTimeMachine')">
          <img src="/assets/icons/time.svg" :alt="$t('timeMachine.title')" width="20" height="20">
        </a>
        <a class="toolbar-icon" :data-tooltip="$t('settings.title')" :aria-label="$t('settings.title')" @click="$emit('openSettings')">
          <img src="/assets/icons/settings.svg" :alt="$t('settings.title')" width="20" height="20">
        </a>
        <div v-if="showAfFilter" class="af-dropdown-container">
          <a class="toolbar-icon toolbar-af-text" :data-tooltip="afTooltip" :aria-label="afTooltip" @click.stop="afDropdownOpen = !afDropdownOpen">
            <span v-if="isCompactAf" class="af-compact" v-html="compactAfLabel" />
            <template v-else>{{ plainAfLabel }}</template>
          </a>
          <div v-if="afDropdownOpen" class="af-dropdown-backdrop" @click="afDropdownOpen = false" />
          <div v-if="afDropdownOpen" class="af-dropdown">
            <a
              v-for="af in AF_OPTIONS"
              :key="af"
              class="af-dropdown-item"
              :class="{ active: af === afFilter }"
              @click="selectAf(af)"
            >{{ afDropdownLabel(af) }}</a>
          </div>
        </div>
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
import { AF_OPTIONS, AF_LABEL_KEYS, AF_TOOLTIP_KEYS } from '@/stores/mapStore'
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
  openSettings: []
  setAf: [af: AfFilter]
  search: [query: string]
}>()

const searchInputRef = ref<HTMLInputElement>()
const afDropdownOpen = ref(false)

const showAfFilter = computed(() => props.mapVersion >= 2)
const afTooltip = computed(() => t(AF_TOOLTIP_KEYS[props.afFilter]))

const plainAfLabel = computed(() => t(AF_LABEL_KEYS[props.afFilter]))
const isCompactAf = computed(() => plainAfLabel.value.includes('\n'))
const compactAfLabel = computed(() =>
  `<span style="font-size:9px;line-height:1.1">${plainAfLabel.value.replace('\n', '<br>')}</span>`,
)

function afDropdownLabel(af: AfFilter) {
  return t(AF_LABEL_KEYS[af]).replace('\n', ' ')
}

function selectAf(af: AfFilter) {
  afDropdownOpen.value = false
  if (af !== props.afFilter) emit('setAf', af)
}

function onSearch() {
  const value = searchInputRef.value?.value?.trim()
  if (value) emit('search', value)
}

defineExpose({ searchInputRef })
</script>
