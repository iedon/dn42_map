import { shallowReactive, shallowRef, triggerRef } from 'vue'
import { zoomIdentity, type ZoomTransform, type Simulation } from 'd3'
import type { MapNode, MapLink, AfFilter, RawGraph } from '@/types'
import { preprocessDataset } from './preprocess'

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
})

// Simulation is non-reactive (mutated by d3 internally)
const simulation = shallowRef<Simulation<MapNode, MapLink> | null>(null)

// Canvas refs — non-reactive, set once
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

const AF_CYCLE: AfFilter[] = [0, 1, 2, 4, 8]

export const AF_LABELS: Record<AfFilter, string> = {
  0: 'ALL',
  1: 'IPv4',
  2: 'IPv6',
  4: 'MCAST\nIPv4',
  8: 'MCAST\nIPv6',
}

export const AF_TOOLTIPS: Record<AfFilter, string> = {
  0: 'Address Family Filter: All',
  1: 'Address Family Filter: IPv4 Unicast',
  2: 'Address Family Filter: IPv6 Unicast',
  4: 'Address Family Filter: IPv4 Multicast',
  8: 'Address Family Filter: IPv6 Multicast',
}

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
