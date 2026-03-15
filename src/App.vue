<template>
  <LoadingOverlay ref="loadingRef" :state="loadingState" :alpha="simAlpha" :error="loadingError" />

  <HeaderToolbar
    :ready="mapReady"
    :mrt-date="mrtDate"
    :map-version="mapVersion"
    :af-filter="store.state.afFilter"
    @toggle-ranking="toggleRanking"
    @open-time-machine="timeMachineOpen = true"
    @open-settings="settingsOpen = true"
    @set-af="onSetAf"
    @search="nav.onSearch"
  />

  <SidebarPanel :open="sidebarOpen" :title="sidebarTitle" @close="nav.clearSelection">
    <NodeDetail
      v-if="sidebarNode"
      :key="sidebarNode.asn"
      :node="sidebarNode"
      @navigate-asn="nav.navigateToAsn"
    />
    <RankingView
      v-else-if="showRanking"
      :nodes="store.state.nodes"
      @navigate-asn="nav.navigateToAsn"
    />
  </SidebarPanel>

  <canvas ref="canvasRef" class="map-canvas" />

  <MapTooltip :node="tooltipNode" :mouse-x="tooltipX" :mouse-y="tooltipY" />
  <MyIpInfo @navigate-asn="nav.navigateToAsn" />
  <TimeMachine :visible="timeMachineOpen" :current-date="mrtDate" @close="timeMachineOpen = false" />
  <SettingsModal :visible="settingsOpen" @close="settingsOpen = false" @saved="onSettingsSaved" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import { fetchGraphData } from '@/api'
import { useMapStore } from '@/stores/mapStore'
import { createSimulation } from '@/graph/simulation'
import { loadSettings } from '@/utils/settings'
import { applyLocale } from '@/i18n'
import { type MapNode, type LoadingState, type AppSettings, type AfFilter, AF_FILTERS } from '@/types'
import { RENDER, MAP_VERSION } from '@/constants'

import LoadingOverlay from '@/components/LoadingOverlay.vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import SidebarPanel from '@/components/sidebar/SidebarPanel.vue'
import NodeDetail from '@/components/sidebar/NodeDetail.vue'
import RankingView from '@/components/sidebar/RankingView.vue'
import MapTooltip from '@/components/MapTooltip.vue'
import MyIpInfo from '@/components/MyIpInfo.vue'
import TimeMachine from '@/components/TimeMachine.vue'
import SettingsModal from '@/components/SettingsModal.vue'

import { useCanvas } from '@/composables/useCanvas'
import { useSidebar } from '@/composables/useSidebar'
import { usePointer } from '@/composables/usePointer'
import { useNavigation } from '@/composables/useNavigation'

const { t } = useI18n()
const store = useMapStore()

// Template refs
const canvasRef = ref<HTMLCanvasElement>()
const loadingRef = ref<InstanceType<typeof LoadingOverlay>>()

// Loading state
const loadingState = ref<LoadingState>('fetching')
const loadingError = ref('')
const simAlpha = ref(1)
const mapReady = ref(false)
const mrtDate = ref('')
const mapVersion = ref(0)
let drawEnabled = false
let needsInitialScale = true

// Tooltip
const tooltipNode = ref<MapNode | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Modal state
const timeMachineOpen = ref(false)
const settingsOpen = ref(false)

// Settings & deferred state
let appSettings = loadSettings()
let pendingNavigateNode: MapNode | null = null
let pendingAfFilter: AfFilter | null = null

// ===== Composables =====

const canvasCtrl = useCanvas(store)
const { sidebarOpen, sidebarNode, showRanking, sidebarTitle, openNodeSidebar, toggleRanking, closeSidebar } = useSidebar(t)

const nav = useNavigation({
  store,
  canvas: canvasCtrl,
  openNodeSidebar,
  closeSidebar,
  draw: () => draw(),
  t: (key: string) => t(key),
  onAfReset: (node) => {
    nav.clearSelection()
    // Node is hidden by current AF filter — reset to ALL and navigate after re-settle
    pendingNavigateNode = node
    drawEnabled = false
    needsInitialScale = false
    loadingState.value = 'rendering'
    loadingRef.value?.show()
    store.setAfFilter(AF_FILTERS.ALL)
  },
})

const pointer = usePointer({
  store,
  sidebarOpen,
  tooltip: { node: tooltipNode, x: tooltipX, y: tooltipY },
  draw: () => draw(),
  enableZoom: () => canvasCtrl.enableZoom(),
  disableZoom: () => canvasCtrl.disableZoom(),
  onNodeClick: (node) => {
    store.setHoveredNode(node)
    nav.navigateToNode(node)
    openNodeSidebar(node)
  },
  onRightClick: () => nav.clearSelection(),
})

// ===== Drawing =====

function draw() {
  if (drawEnabled) canvasCtrl.draw()
}

// ===== State management =====

function getCenterAsn() {
  return appSettings.centerMode === 'custom' ? appSettings.centerAsn : undefined
}

function onSetAf(af: AfFilter) {
  nav.clearSelection()
  if (loadingState.value === 'rendering') return
  drawEnabled = false
  needsInitialScale = true
  loadingState.value = 'rendering'
  loadingRef.value?.show()
  store.setAfFilter(af)
}

function onSettingsSaved(settings: AppSettings) {
  applyLocale(settings.locale)
  appSettings = settings
  // AF filter and center node settings take effect on next page load
  // to avoid disrupting the current session's simulation state
}

// ===== Keyboard & gestures =====

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (settingsOpen.value) settingsOpen.value = false
    if (timeMachineOpen.value) timeMachineOpen.value = false
    nav.clearSelection()
    e.preventDefault()
  }
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
  if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
    toggleRanking()
    e.preventDefault()
  } else if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
    canvasCtrl.setInitialScale(getCenterAsn())
    e.preventDefault()
  }
}

function onGestureStart(e: Event) { e.preventDefault() }

// ===== Lifecycle =====

onMounted(async () => {
  applyLocale(appSettings.locale)

  document.addEventListener('gesturestart', onGestureStart)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', canvasCtrl.onResize)
  window.addEventListener('hashchange', nav.onHashChange)

  try {
    const urlParams = new URLSearchParams(location.search)
    const data = await fetchGraphData(urlParams.get('data'))

    loadingState.value = 'parsing'
    store.loadData(data)

    const date = new Date(data.metadata.data_timestamp * 1000)
    mrtDate.value = date.toLocaleString()
    mapVersion.value = data.metadata.version || 0

    loadingState.value = 'rendering'
    mapReady.value = true

    await nextTick()
    store.setCanvas(canvasRef.value!)
    canvasCtrl.initCanvas(draw)

    /** Called when D3 simulation settles or ends — handles deferred AF filter and pending navigation */
    const finishLoading = () => {
      // If a saved AF filter is pending, apply it and wait for re-settle
      if (pendingAfFilter !== null) {
        const af = pendingAfFilter
        pendingAfFilter = null
        store.setAfFilter(af)
        return
      }

      loadingRef.value?.finish()
      drawEnabled = true

      if (needsInitialScale) {
        const centerNode = canvasCtrl.setInitialScale(getCenterAsn())
        needsInitialScale = false
        // Auto-show nodeinfo of center node if enabled
        if (appSettings.autoShowNodeInfo && centerNode && !location.hash) {
          store.setHoveredNode(centerNode)
          location.hash = String(centerNode.asn)
          openNodeSidebar(centerNode)
          document.title = `${centerNode.desc} (AS${centerNode.asn}) - ${t('pageTitle')}`
        }
      }

      if (pendingNavigateNode) {
        const node = pendingNavigateNode
        pendingNavigateNode = null
        nav.navigateToNode(node)
        openNodeSidebar(node)
      }
    }

    const sim = createSimulation(
      store.state.nodes,
      store.state.links,
      () => {
        draw()
        if (!drawEnabled) {
          const alpha = sim.alpha()
          simAlpha.value = alpha
          if (alpha < RENDER.d3force.settleAlpha) finishLoading()
        }
      },
      () => {
        loadingState.value = 'done'
        finishLoading()
      },
      () => store.state.filterRatio,
    )

    store.setSimulation(sim)

    // Defer saved AF filter — let ALL-links simulation settle first,
    // then finishLoading will apply it and wait for re-settle.
    // Skip if hash node wouldn't be visible in that AF (avoids ALL→AF→ALL triple render).
    if (appSettings.afFilter && mapVersion.value >= MAP_VERSION) {
      let skip = false
      if (location.hash) {
        const hashNode = nav.resolveNode(location.hash.slice(1))
        if (hashNode) {
          skip = !store.state.deduplicatedLinks.some(
            l => (l.af & appSettings.afFilter) && (l.source.asn === hashNode.asn || l.target.asn === hashNode.asn),
          )
        }
      }
      if (!skip) pendingAfFilter = appSettings.afFilter
    }

    pointer.bind(store.getCanvas()!)
    canvasCtrl.enableZoom()
    draw()

    if (location.hash) {
      sim.on('end.hash', () => {
        nav.searchNodeByHash(location.hash.slice(1))
        sim.on('end.hash', null)
      })
    }
  } catch (error: any) {
    console.error('Error initializing the graph:', error)
    loadingError.value = error.message || String(error)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('gesturestart', onGestureStart)
  document.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', canvasCtrl.onResize)
  window.removeEventListener('hashchange', nav.onHashChange)
  pointer.unbind(store.getCanvas())
  store.getSimulation()?.stop()
})
</script>
