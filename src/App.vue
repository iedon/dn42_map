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
    @search="onSearch"
  />

  <SidebarPanel :open="sidebarOpen" :title="sidebarTitle" @close="closeSidebar">
    <NodeDetail
      v-if="sidebarNode"
      :key="sidebarNode.asn"
      :node="sidebarNode"
      @navigate-asn="navigateToAsn"
    />
    <RankingView
      v-else-if="showRanking"
      :nodes="store.state.nodes"
      @navigate-asn="navigateToAsn"
    />
  </SidebarPanel>

  <canvas ref="canvasRef" class="map-canvas" />

  <MapTooltip :node="tooltipNode" :mouse-x="tooltipX" :mouse-y="tooltipY" />
  <MyIpInfo @navigate-asn="navigateToAsn" />
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
import { detectLocale } from '@/i18n'
import i18n from '@/i18n'
import { type MapNode, type LoadingState, type AppSettings, type AfFilter, AF_FILTERS } from '@/types'

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
import { MAP_VERSION } from './constants'

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

// TimeMachine & Settings
const timeMachineOpen = ref(false)
const settingsOpen = ref(false)

// Settings
let appSettings = loadSettings()
let pendingNavigateNode: MapNode | null = null
let pendingAfFilter: AfFilter | null = null

// ===== Composables =====

const canvas = useCanvas(store)
const { sidebarOpen, sidebarNode, showRanking, sidebarTitle, openNodeSidebar, toggleRanking, closeSidebar } = useSidebar(t)
const pointer = usePointer({
  store,
  sidebarOpen,
  tooltip: { node: tooltipNode, x: tooltipX, y: tooltipY },
  draw: () => draw(),
  enableZoom: () => canvas.enableZoom(),
  disableZoom: () => canvas.disableZoom(),
  onNodeClick: (node) => {
    store.setHoveredNode(node)
    navigateToNode(node)
    openNodeSidebar(node)
  },
  onRightClick: () => clearSelection(),
})

// ===== Drawing =====

function draw() {
  if (drawEnabled) canvas.draw()
}

// ===== Navigation =====

function navigateToNode(node: MapNode) {
  store.setHoveredNode(node)
  if (location.hash !== `#${node.asn}`) location.hash = String(node.asn)
  if (node.x !== undefined && node.y !== undefined) canvas.animateToNode(node)
  document.title = `${node.desc} (AS${node.asn}) - ${t('pageTitle')}`
  draw()
}

function isNodeVisible(node: MapNode): boolean {
  return !store.state.visibleNodeAsns || store.state.visibleNodeAsns.has(node.asn)
}

function switchAfAndNavigate(node: MapNode) {
  pendingNavigateNode = node
  drawEnabled = false
  needsInitialScale = false
  loadingState.value = 'rendering'
  loadingRef.value?.show()
  store.setAfFilter(AF_FILTERS.ALL)
}

function navigateToAsn(asn: number) {
  const node = store.state.nodeMap.get(asn.toString())
  if (!node) return
  if (!isNodeVisible(node)) { switchAfAndNavigate(node); return }
  navigateToNode(node)
  openNodeSidebar(node)
}

function resolveNode(query: string): MapNode | undefined {
  const q = query.toLowerCase()
  return store.state.nodeMap.get(q)
    || (!query.startsWith('424242') ? store.state.nodeMap.get(`424242${q}`) : undefined)
}

function onSearch(value: string) {
  const node = resolveNode(value)
  if (!node) { alert(t('search.notFound')); return }
  if (!isNodeVisible(node)) { switchAfAndNavigate(node); return }
  navigateToNode(node)
  openNodeSidebar(node)
}

function searchNodeByHash(hash: string) {
  const node = resolveNode(hash)
  if (!node) { clearSelection(); return }
  if (!isNodeVisible(node)) { switchAfAndNavigate(node); return }
  navigateToNode(node)
  openNodeSidebar(node)
}

// ===== State management =====

function getCenterAsn() {
    return appSettings.centerMode === 'custom' ? appSettings.centerAsn : undefined
}

function clearSelection() {
  closeSidebar()
  store.setHoveredNode(null)
  draw()
  if (location.hash) history.pushState('', document.title, location.pathname + location.search)
  document.title = t('pageTitle')
}

function onSetAf(af: AfFilter) {
  clearSelection()
  if (loadingState.value === 'rendering') return
  drawEnabled = false
  needsInitialScale = true
  loadingState.value = 'rendering'
  loadingRef.value?.show()
  store.setAfFilter(af)
}

function applyLocale(locale: string) {
  const resolved = locale || detectLocale()
  const loc = i18n.global.locale as unknown as { value: string }
  if (loc.value !== resolved) {
    loc.value = resolved
    document.documentElement.lang = resolved
    document.title = t('pageTitle')
  }
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
    clearSelection()
    e.preventDefault()
  } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
    toggleRanking()
    e.preventDefault()
  } else if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
    canvas.setInitialScale(getCenterAsn())
    e.preventDefault()
  }
}

function onGestureStart(e: Event) { e.preventDefault() }

function onHashChange() {
  const hash = location.hash.slice(1)
  if (hash && store.state.nodeMap.size) searchNodeByHash(hash)
  else clearSelection()
}

// ===== Lifecycle =====

onMounted(async () => {
  // Apply saved locale
  applyLocale(appSettings.locale)

  document.addEventListener('gesturestart', onGestureStart)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', canvas.onResize)
  window.addEventListener('hashchange', onHashChange)

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
    canvas.initCanvas(draw)

    const finishLoading = () => {
      // If a saved AF filter is pending, apply it now (after ALL-links settle)
      // and let the simulation re-settle before finishing
      if (pendingAfFilter !== null) {
        const af = pendingAfFilter
        pendingAfFilter = null
        store.setAfFilter(af)
        return
      }

      loadingRef.value?.finish()
      drawEnabled = true
      if (needsInitialScale) {
        const centerNode = canvas.setInitialScale(getCenterAsn())
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
        navigateToNode(node)
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
          if (alpha < 0.02) finishLoading()
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
        const hashNode = resolveNode(location.hash.slice(1))
        if (hashNode) {
          skip = !store.state.deduplicatedLinks.some(
            l => (l.af & appSettings.afFilter) && (l.source.asn === hashNode.asn || l.target.asn === hashNode.asn),
          )
        }
      }
      if (!skip) pendingAfFilter = appSettings.afFilter
    }
    pointer.bind(store.getCanvas()!)
    canvas.enableZoom()
    draw()

    if (location.hash) {
      sim.on('end.hash', () => {
        searchNodeByHash(location.hash.slice(1))
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
  window.removeEventListener('resize', canvas.onResize)
  window.removeEventListener('hashchange', onHashChange)
  pointer.unbind(store.getCanvas())
  store.getSimulation()?.stop()
})
</script>
