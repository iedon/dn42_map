<template>
  <Teleport to="body">
    <div v-if="visible" class="map-version-overlay" :class="{ show: visible }" @click.self="$emit('close')">
      <div class="map-version-popup">
        <!-- Header -->
        <div class="map-version-header">
          <h2 class="map-version-title">{{ $t('timeMachine.title') }}</h2>
          <button class="map-version-close" aria-label="Close" @click="$emit('close')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <!-- Nav -->
        <div class="map-version-nav">
          <template v-if="!activeMonth">
            <div class="nav-left">{{ $t('timeMachine.loaded', { date: currentDate }) }}</div>
            <div class="quick-actions">
              <button class="quick-btn" aria-label="Load latest version" @click="loadLatest">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                </svg>
                {{ $t('timeMachine.goToLatest') }}
              </button>
            </div>
          </template>
          <template v-else>
            <div class="nav-left">
              <button class="back-btn" @click="activeMonth = null">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                </svg>
                {{ $t('timeMachine.back') }}
              </button>
            </div>
            <div class="nav-center">
              <h3>{{ monthNames[parseInt(activeMonth.month) - 1] }} {{ activeMonth.year }}</h3>
            </div>
          </template>
        </div>

        <!-- Content -->
        <div class="map-version-content">
          <template v-if="loading">
            <div class="map-version-loading">
              <div class="loading-spinner fetching" />
              <div class="loading-text">{{ $t('timeMachine.loadingSnapshots') }}</div>
            </div>
          </template>

          <template v-else-if="error">
            <div class="map-version-error">
              <p>{{ $t('timeMachine.loadFailed', { error }) }}</p>
              <p>{{ $t('timeMachine.serviceUnavailable') }}</p>
              <button class="retry-btn" @click="load">{{ $t('timeMachine.retry') }}</button>
            </div>
          </template>

          <template v-else-if="!activeMonth">
            <!-- Calendar View -->
            <div class="calendar-section">
              <div class="calendar-nav">
                <select class="year-select" :value="selectedYear" @change="selectedYear = ($event.target as HTMLSelectElement).value">
                  <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
                </select>
              </div>
              <div class="calendar-months">
                <div
                  v-for="month in 12"
                  :key="month"
                  class="calendar-month"
                  :class="{ 'has-data': hasMonthData(month), current: isCurrentMonth(month) }"
                  @click="openMonth(month)"
                >
                  <div class="month-name">{{ monthNamesShort[month - 1] }}</div>
                  <div class="month-count">{{ getMonthCount(month) }}</div>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <!-- Month Detail View -->
            <div class="month-details">
              <div class="files-grid">
                <div
                  v-for="file in monthFiles"
                  :key="file.name"
                  class="file-card"
                  @click="loadVersion(file.url)"
                >
                  <div class="file-date">{{ file.readableDate }}</div>
                  <div class="file-name">{{ file.name }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { fetchMapVersions } from '@/api'
import { DN42 } from '@/constants'
import type { TimeMachineVersions } from '@/types'

const props = defineProps<{
  visible: boolean
  currentDate: string
}>()

defineEmits<{
  close: []
}>()

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const loading = ref(false)
const error = ref('')
const versions = ref<TimeMachineVersions | null>(null)
const selectedYear = ref(String(new Date().getFullYear()))
const activeMonth = ref<{ year: string; month: string } | null>(null)

const years = computed(() =>
  versions.value ? Object.keys(versions.value).sort((a, b) => b.localeCompare(a)) : [],
)

function hasMonthData(month: number): boolean {
  const key = String(month).padStart(2, '0')
  return !!(versions.value?.[selectedYear.value]?.[key]?.length)
}

function isCurrentMonth(month: number): boolean {
  const now = new Date()
  return selectedYear.value === String(now.getFullYear()) && month - 1 === now.getMonth()
}

function getMonthCount(month: number): number {
  const key = String(month).padStart(2, '0')
  return versions.value?.[selectedYear.value]?.[key]?.length || 0
}

function openMonth(month: number) {
  if (!hasMonthData(month)) return
  activeMonth.value = { year: selectedYear.value, month: String(month).padStart(2, '0') }
}

const monthFiles = computed(() => {
  if (!activeMonth.value || !versions.value) return []
  const files = versions.value[activeMonth.value.year]?.[activeMonth.value.month] || []

  return [...files]
    .sort((a, b) => parseFileDate(b).getTime() - parseFileDate(a).getTime())
    .map(name => ({
      name,
      readableDate: formatReadableDate(name),
      url: `${DN42.timeMachineBinUrlPrefix}/${activeMonth.value!.year}/${activeMonth.value!.month}/${name}`,
    }))
})

function parseFileDate(filename: string): Date {
  const m = filename.match(/map_(\d{4})_(\d{2})_(\d{2})\.bin/)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(0)
}

function formatReadableDate(filename: string): string {
  const m = filename.match(/map_(\d{4})_(\d{2})_(\d{2})\.bin/)
  if (!m) return ''
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
  })
}

function loadVersion(url: string) {
  location.href = `/?data=${encodeURIComponent(url)}`
}

function loadLatest() {
  location.href = '/'
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    versions.value = await fetchMapVersions()
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) {
    activeMonth.value = null
    load()
  }
})
</script>
