import { shallowReactive, shallowRef, triggerRef } from 'vue'
import { zoomIdentity, type ZoomTransform, type Simulation, type ForceLink } from 'd3'
import { type MapNode, type MapLink, type AfFilter, type RawGraph } from '@/types'
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
  visibleNodes: MapNode[]
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
  visibleNodes: [],
  visibleNodeAsns: null,
  filterRatio: 1,
})

// Simulation is non-reactive (mutated by d3 internally)
const simulation = shallowRef<Simulation<MapNode, MapLink> | null>(null)

// Canvas refs — non-reactive, set once
let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

function rebuildVisibleNodeAsns() {
  if (!state.afFilter) {
    state.visibleNodes = state.nodes
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
  state.visibleNodes = state.nodes.filter(n => visible.has(n.asn))
  state.visibleNodeAsns = visible
}

export function useMapStore() {
  function loadData(data: RawGraph) {
    state.rawData = data
    const result = preprocessDataset(data)
    state.nodes = result.nodes
    state.visibleNodes = result.nodes
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

  function setAfFilter(af: AfFilter) {
    if (state.afFilter === af) return
    state.afFilter = af
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
    setAfFilter,
  }
}
