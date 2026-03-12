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
import { ref, toRaw, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { select, zoom as d3zoom, zoomIdentity, forceCenter, type ZoomBehavior } from 'd3'
import { useI18n } from 'vue-i18n'

import { fetchGraphData } from '@/api'
import { RENDER } from '@/constants'
import { useMapStore } from '@/stores/mapStore'
import { renderFrame } from '@/graph/renderer'
import { createSimulation } from '@/graph/simulation'
import { throttle } from '@/utils/timing'
import type { MapNode, LoadingState } from '@/types'

import LoadingOverlay from '@/components/LoadingOverlay.vue'
import HeaderToolbar from '@/components/HeaderToolbar.vue'
import SidebarPanel from '@/components/sidebar/SidebarPanel.vue'
import NodeDetail from '@/components/sidebar/NodeDetail.vue'
import RankingView from '@/components/sidebar/RankingView.vue'
import MapTooltip from '@/components/MapTooltip.vue'
import MyIpInfo from '@/components/MyIpInfo.vue'
import TimeMachine from '@/components/TimeMachine.vue'

const { t } = useI18n()

const store = useMapStore()

// Refs
const canvasRef = ref<HTMLCanvasElement>()
const loadingRef = ref<InstanceType<typeof LoadingOverlay>>()

// Loading state
const loadingState = ref<LoadingState>('fetching')
const loadingError = ref('')
const simAlpha = ref(1)
const mapReady = ref(false)
const mrtDate = ref('')
const mapVersion = ref(0)

// Sidebar
const sidebarOpen = ref(false)
const sidebarNode = ref<MapNode | null>(null)
const showRanking = ref(false)
const sidebarTitle = ref('')

// Tooltip
const tooltipNode = ref<MapNode | null>(null)
const tooltipX = ref(0)
const tooltipY = ref(0)

// TimeMachine
const timeMachineOpen = ref(false)

// Interaction state
let focusingNode: MapNode | null = null
let draggingNode: MapNode | null = null
let pointerIsDown = false
let showingTooltip = false
let zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>
let isFirstTimeLoading = true
let isFirstTimeLoaded = true

// ===== Canvas setup =====

function setupCanvas() {
  const canvas = canvasRef.value!
  store.setCanvas(canvas)
  const ctx = store.getCtx()!

  canvas.width = innerWidth * RENDER.pixelRatio
  canvas.height = innerHeight * RENDER.pixelRatio
  canvas.style.width = `${innerWidth}px`
  canvas.style.height = `${innerHeight}px`
  ctx.scale(RENDER.pixelRatio, RENDER.pixelRatio)

  zoomBehavior = d3zoom<HTMLCanvasElement, unknown>()
    .scaleExtent([RENDER.canvas.zoom.min, RENDER.canvas.zoom.max])
    .on('zoom', (event) => {
      store.setTransform(event.transform)
      draw()
    })
}

function draw() {
  if (isFirstTimeLoading) return
  const canvas = store.getCanvas()!
  const ctx = store.getCtx()!
  const s = toRaw(store.state)
  renderFrame(canvas, ctx, s.transform, s.deduplicatedLinks, s.nodes, s.hoveredNode, s.afFilter, s.visibleNodeAsns)
}

function setInitialScale() {
  const { nodes } = store.state
  const canvas = store.getCanvas()!

  let cx = 0, cy = 0
  if (nodes.length) {
    for (const n of nodes) { cx += n.x || 0; cy += n.y || 0 }
    cx /= nodes.length; cy /= nodes.length
  } else {
    cx = innerWidth / 2; cy = innerHeight / 2
  }

  const scale = RENDER.canvas.zoom.initial
  const tx = innerWidth / 2 - cx * scale
  const ty = innerHeight / 2 - cy * scale

  select(canvas).call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale))
}

function enableZoom() {
  select(store.getCanvas()!).call(zoomBehavior).on('dblclick.zoom', null)
}

function disableZoom() {
  select(store.getCanvas()!).on('.zoom', null)
}

// ===== Pointer events =====

function getCoord(event: PointerEvent): [number, number] {
  const canvas = store.getCanvas()!
  const rect = canvas.getBoundingClientRect()
  return store.state.transform.invert([
    event.pageX - (rect.left + (scrollX || document.documentElement.scrollLeft)),
    event.pageY - (rect.top + (scrollY || document.documentElement.scrollTop)),
  ]) as [number, number]
}

function findClosestNode(x: number, y: number): MapNode | null {
  let minDist = Infinity, closest: MapNode | null = null
  const raw = toRaw(store.state)
  const { visibleNodeAsns, nodes } = raw

  for (const node of nodes) {
    if (visibleNodeAsns && !visibleNodeAsns.has(node.asn)) continue
    const dist = Math.hypot(node.x - x, node.y - y)
    if (dist < 15 && dist < minDist) {
      minDist = dist
      closest = node
    }
  }
  return closest
}

const onPointerMove = throttle((event: PointerEvent) => {
  const [x, y] = getCoord(event)
  const canvas = store.getCanvas()!

  if (focusingNode) {
    draggingNode = focusingNode
    disableZoom()
    store.getSimulation()?.alphaTarget(0.3).restart()
    focusingNode = null
  }

  if (draggingNode) {
    if (showingTooltip) { tooltipNode.value = null; showingTooltip = false }
    draggingNode.fx = x
    draggingNode.fy = y
    draw()
    return
  }

  if (!pointerIsDown) {
    const hovered = findClosestNode(x, y)
    canvas.style.cursor = hovered ? 'pointer' : 'grab'
    if (hovered) {
      if (!sidebarOpen.value) {
        store.setHoveredNode(hovered)
        draw()
      }
      tooltipNode.value = hovered
      tooltipX.value = event.clientX
      tooltipY.value = event.clientY
      showingTooltip = true
    } else {
      tooltipNode.value = null
      showingTooltip = false
    }
  } else {
    canvas.style.cursor = 'grabbing'
  }
}, 13)

function onPointerDown(event: PointerEvent) {
  pointerIsDown = true
  const [x, y] = getCoord(event)
  focusingNode = findClosestNode(x, y)
  if (focusingNode) disableZoom()
  else store.getCanvas()!.style.cursor = 'grabbing'
}

function onPointerUp(event: PointerEvent) {
  pointerIsDown = false
  if (focusingNode) {
    const [x, y] = getCoord(event)
    const node = findClosestNode(x, y)
    if (node) {
      store.setHoveredNode(node)
      navigateToNode(node)
      openNodeSidebar(node)
    }
    focusingNode = null
    enableZoom()
    return
  }
  store.getCanvas()!.style.cursor = 'grab'
  stopDragging()
}

function onPointerLeave() {
  pointerIsDown = false
  focusingNode = null
  stopDragging()
}

function stopDragging() {
  if (draggingNode) {
    draggingNode.fx = null
    draggingNode.fy = null
    store.getSimulation()?.alphaTarget(0)
    draggingNode = null
    enableZoom()
  }
}

function onContextMenu(e: Event) {
  e.preventDefault()
  clearSelection()
}

// ===== Navigation =====

function navigateToNode(node: MapNode) {
  store.setHoveredNode(node)

  if (location.hash !== `#${node.asn}`) {
    location.hash = String(node.asn)
  }

  if (node.x !== undefined && node.y !== undefined) {
    const canvas = store.getCanvas()!
    const scale = store.state.transform.k
    const tx = innerWidth / 2 - node.x * scale
    const ty = innerHeight / 2 - node.y * scale

    select(canvas)
      .transition()
      .duration(500)
      .call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale))
  }

  document.title = `${node.desc} (AS${node.asn}) - ${t('pageTitle')}`
  draw()
}

function navigateToAsn(asn: number) {
  const node = store.state.nodeMap.get(asn.toString())
  if (!node) return
  navigateToNode(node)
  openNodeSidebar(node)
}

function searchNodeByHash(hash: string) {
  const query = hash.toLowerCase()
  let node = store.state.nodeMap.get(query)

  if (!node && !hash.startsWith('424242')) {
    node = store.state.nodeMap.get(`424242${query}`)
  }

  if (node) {
    navigateToNode(node)
    openNodeSidebar(node)
  } else {
    clearSelection()
  }
}

function onSearch(value: string) {
  const query = value.toLowerCase()
  let node = store.state.nodeMap.get(query)

  if (!node && !value.startsWith('424242')) {
    node = store.state.nodeMap.get(`424242${query}`)
  }

  if (node) {
    navigateToNode(node)
    openNodeSidebar(node)
  } else {
    alert(t('search.notFound'))
  }
}

// ===== Sidebar =====

function openNodeSidebar(node: MapNode) {
  sidebarNode.value = node
  showRanking.value = false
  sidebarTitle.value = node.desc
  sidebarOpen.value = true
}

function toggleRanking() {
  if (showRanking.value && sidebarOpen.value) {
    closeSidebar()
  } else {
    sidebarNode.value = null
    showRanking.value = true
    sidebarTitle.value = t('sidebar.ranking')
    sidebarOpen.value = true
  }
}

function closeSidebar() {
  sidebarOpen.value = false
  sidebarNode.value = null
  showRanking.value = false
}

function clearSelection() {
  closeSidebar()
  store.setHoveredNode(null)
  draw()
  if (location.hash) {
    history.pushState('', document.title, location.pathname + location.search)
  }
  document.title = t('pageTitle')
}

function onCycleAf() {
  store.cycleAfFilter()
  setInitialScale()
  draw()
}

// ===== Keyboard =====

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (timeMachineOpen.value) {
      timeMachineOpen.value = false
    } else {
      clearSelection()
    }
    e.preventDefault()
  }
}

// ===== Resize =====

function onResize() {
  const canvas = store.getCanvas()!
  const ctx = store.getCtx()!

  canvas.width = innerWidth * RENDER.pixelRatio
  canvas.height = innerHeight * RENDER.pixelRatio
  canvas.style.width = `${innerWidth}px`
  canvas.style.height = `${innerHeight}px`
  ctx.scale(RENDER.pixelRatio, RENDER.pixelRatio)

  const sim = store.getSimulation()
  if (sim) {
    sim.force('center', forceCenter(innerWidth / 2, innerHeight / 2))
    sim.alpha(0.5).restart()
  }
}

// ===== Gesture prevention =====

function onGestureStart(e: Event) {
  e.preventDefault()
}

// ===== Init =====

onMounted(async () => {
  document.addEventListener('gesturestart', onGestureStart)
  document.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
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
    setupCanvas()

    const sim = createSimulation(
      store.state.nodes,
      store.state.links,
      () => {
        draw()
        if (isFirstTimeLoading) {
          const alpha = sim.alpha()
          simAlpha.value = alpha
          if (alpha < 0.02) {
            loadingRef.value?.finish()
            isFirstTimeLoading = false
            if (isFirstTimeLoaded) {
              setInitialScale()
              isFirstTimeLoaded = false
            }
          }
        }
      },
      () => {
        loadingRef.value?.finish()
        isFirstTimeLoading = false
        if (isFirstTimeLoaded) {
          setInitialScale()
          isFirstTimeLoaded = false
        }
      },
    )

    store.setSimulation(sim)

    // Bind canvas events
    const canvas = store.getCanvas()!
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('contextmenu', onContextMenu)

    enableZoom()
    draw()

    // Handle initial hash after simulation settles
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
  window.removeEventListener('resize', onResize)

  const canvas = store.getCanvas()
  if (canvas) {
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('contextmenu', onContextMenu)
  }

  store.getSimulation()?.stop()
})
</script>
