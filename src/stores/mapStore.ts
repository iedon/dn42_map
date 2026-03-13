import { shallowReactive, shallowRef, triggerRef } from 'vue'
import { zoomIdentity, type ZoomTransform, type Simulation, type ForceLink } from 'd3'
import type { MapNode, MapLink, AfFilter, RawGraph } from '@/types'
import { preprocessDataset } from './preprocess'
import { scaleSqrt } from '@/utils/scale'
import { RENDER } from '@/constants'

export interface MapState {
  rawData: RawGraph | null
  nodes: MapNode[]
  links: MapLink[]
  deduplicatedLinks: MapLink[]
  nodeMap: Map<string, MapNode>
  linkMap: Map<string, boolean>
  hoveredNode: MapNode | null
  transform: ZoomTransform
  afFilter: AfFilter
  visibleNodeAsns: Set<number> | null
  filterRatio: number
}

const state = shallowReactive<MapState>({
  rawData: null,
  nodes: [],
  links: [],
  deduplicatedLinks: [],
  nodeMap: new Map(),
  linkMap: new Map(),
  hoveredNode: null,
  transform: zoomIdentity,
  afFilter: 0,
  visibleNodeAsns: null,
  filterRatio: 1,
})

// Simulation is non-reactive (mutated by d3 internally)
const simulation = shallowRef<Simulation<MapNode, MapLink> | null>(null)

// Canvas refs — non-reactive, set once
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

const AF_CYCLE: AfFilter[] = [0, 1, 2, 4, 8]

// AF filter: 0=ALL, 1=IPv4, 2=IPv6, 4=MCAST IPv4, 8=MCAST IPv6
// Links from backend carry a bitmask (e.g. af=5 means v4 unicast + v4 multicast).
// The bitwise & check in rebuildVisibleNodeAsns matches any link whose af includes the filter bit.
export const AF_LABEL_KEYS: Record<number, string> = { 0: 'af.all', 1: 'af.ipv4', 2: 'af.ipv6', 4: 'af.mcastIpv4', 8: 'af.mcastIpv6' }
export const AF_TOOLTIP_KEYS: Record<number, string> = { 0: 'af.tooltipAll', 1: 'af.tooltipIpv4', 2: 'af.tooltipIpv6', 4: 'af.tooltipMcastIpv4', 8: 'af.tooltipMcastIpv6' }

function rebuildVisibleNodeAsns() {
  if (!state.afFilter) {
    state.visibleNodeAsns = null
    return
  }
  const visible = new Set<number>()
  for (const link of state.deduplicatedLinks) {
    if (link.af & state.afFilter) {
      visible.add(link.source.asn)
      visible.add(link.target.asn)
    }
  }
  state.visibleNodeAsns = visible
}

export function useMapStore() {
  function loadData(data: RawGraph) {
    state.rawData = data
    const result = preprocessDataset(data)
    state.nodes = result.nodes
    state.links = result.links
    state.deduplicatedLinks = result.deduplicatedLinks
    state.nodeMap = result.nodeMap
    state.linkMap = result.linkMap
  }

  function setCanvas(c: HTMLCanvasElement) {
    canvas = c
    ctx = c.getContext('2d')!
  }

  function getCanvas() { return canvas }
  function getCtx() { return ctx }

  function setSimulation(sim: Simulation<MapNode, MapLink>) {
    simulation.value = sim
    triggerRef(simulation)
  }

  function getSimulation() { return simulation.value }

  function setTransform(t: ZoomTransform) {
    state.transform = t
  }

  function setHoveredNode(node: MapNode | null) {
    state.hoveredNode = node
  }

  function cycleAfFilter() {
    const idx = AF_CYCLE.indexOf(state.afFilter)
    state.afFilter = AF_CYCLE[(idx + 1) % AF_CYCLE.length]
    rebuildVisibleNodeAsns()
    applyFilterToSimulation()
  }

  /** Recompute forces and node sizes based on current AF filter ratio */
  function applyFilterToSimulation() {
    const sim = simulation.value
    if (!sim) return

    const totalCount = state.nodes.length
    let visibleCount = totalCount
    let activeLinks: MapLink[] = state.links

    if (state.visibleNodeAsns && state.afFilter) {
      visibleCount = state.visibleNodeAsns.size || 1
      activeLinks = state.links.filter(l => l.af & state.afFilter)
    }

    // Update ratio — function accessors in the simulation read this
    state.filterRatio = Math.max(RENDER.d3force.filterRatioMin, visibleCount / totalCount)

    // Swap active links and re-initialize all forces (re-evaluates distance/strength functions)
    sim.force<ForceLink<MapNode, MapLink>>('link')?.links(activeLinks)
    sim.nodes(state.nodes)

    // Rescale visible node sizes
    const { minSize, maxSize, scaleSqrtDomain, scaleSqrtRange } = RENDER.node
    const sizeFactor = 1 / state.filterRatio
    for (const node of state.nodes) {
      const baseSize = scaleSqrt(scaleSqrtDomain, scaleSqrtRange, node.centrality.index) || minSize
      const s = (state.visibleNodeAsns && !state.visibleNodeAsns.has(node.asn)) ? 1 : sizeFactor
      node.size = Math.min(maxSize, Math.max(minSize, baseSize * s))
    }

    sim.alpha(1).restart()
  }

  return {
    state,
    loadData,
    setCanvas,
    getCanvas,
    getCtx,
    setSimulation,
    getSimulation,
    setTransform,
    setHoveredNode,
    cycleAfFilter,
  }
}
