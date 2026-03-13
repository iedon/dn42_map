<template>
  <LoadingOverlay ref="loadingRef" :state="loadingState" :alpha="simAlpha" :error="loadingError" />

  <HeaderToolbar
    :ready="mapReady"
    :mrt-date="mrtDate"
    :map-version="mapVersion"
    :af-filter="store.state.afFilter"
    @toggle-ranking="toggleRanking"
    @open-time-machine="timeMachineOpen = true"
    @cycle-af="onCycleAf"
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
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import { fetchGraphData } from '@/api'
import { useMapStore } from '@/stores/mapStore'
import { createSimulation } from '@/graph/simulation'
import type { MapNode, LoadingState } from '@/types'

import LoadingOverlay from '@/components/LoadingOverlay.vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import SidebarPanel from '@/components/sidebar/SidebarPanel.vue'
import NodeDetail from '@/components/sidebar/NodeDetail.vue'
import RankingView from '@/components/sidebar/RankingView.vue'
import MapTooltip from '@/components/MapTooltip.vue'
import MyIpInfo from '@/components/MyIpInfo.vue'
import TimeMachine from '@/components/TimeMachine.vue'

import { useCanvas } from '@/composables/useCanvas'
import { useSidebar } from '@/composables/useSidebar'
import { usePointer } from '@/composables/usePointer'

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

// TimeMachine
const timeMachineOpen = ref(false)

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

function navigateToAsn(asn: number) {
  const node = store.state.nodeMap.get(asn.toString())
  if (!node) return
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
  if (node) { navigateToNode(node); openNodeSidebar(node) }
  else alert(t('search.notFound'))
}

function searchNodeByHash(hash: string) {
  const node = resolveNode(hash)
  if (node) { navigateToNode(node); openNodeSidebar(node) }
  else clearSelection()
}

// ===== State management =====

function clearSelection() {
  closeSidebar()
  store.setHoveredNode(null)
  draw()
  if (location.hash) history.pushState('', document.title, location.pathname + location.search)
  document.title = t('pageTitle')
}

function onCycleAf() {
  if (loadingState.value === 'rendering') return
  clearSelection()
  drawEnabled = false
  needsInitialScale = true
  loadingState.value = 'rendering'
  loadingRef.value?.show()
  store.cycleAfFilter()
}

// ===== Keyboard & gestures =====

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (timeMachineOpen.value) timeMachineOpen.value = false
    else clearSelection()
    e.preventDefault()
  }
}

function onGestureStart(e: Event) { e.preventDefault() }

// ===== Lifecycle =====

onMounted(async () => {
  document.addEventListener('gesturestart', onGestureStart)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', canvas.onResize)
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1)
    if (hash && store.state.nodeMap.size) searchNodeByHash(hash)
    else clearSelection()
  })

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
      loadingRef.value?.finish()
      drawEnabled = true
      if (needsInitialScale) {
        canvas.setInitialScale()
        needsInitialScale = false
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
  pointer.unbind(store.getCanvas())
  store.getSimulation()?.stop()
})
</script>
