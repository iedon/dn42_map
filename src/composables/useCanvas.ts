import { toRaw } from 'vue'
import { select, zoom as d3zoom, zoomIdentity, forceCenter, type ZoomBehavior } from 'd3'
import { RENDER, TIMING, DN42 } from '@/constants'
import { useMapStore } from '@/stores/mapStore'
import { renderFrame } from '@/graph/renderer'
import { debounce } from '@/utils/timing'
import type { MapNode } from '@/types'

export function useCanvas(store: ReturnType<typeof useMapStore>) {
  let zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown>

  function initCanvas(onZoom: () => void) {
    const canvas = store.getCanvas()!
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
        onZoom()
      })
  }

  function draw() {
    const canvas = store.getCanvas()!
    const ctx = store.getCtx()!
    const s = toRaw(store.state)
    renderFrame(canvas, ctx, s.transform, s.deduplicatedLinks, s.visibleNodes, s.hoveredNode, s.afFilter, s.visibleNodeAsns)
  }

  /** Returns the node used as center (highest index or custom ASN). */
  function setInitialScale(centerAsn?: string): MapNode | null {
    const { nodes, visibleNodeAsns, nodeMap } = store.state
    const canvas = store.getCanvas()!

    let centerNode: MapNode | null = null

    if (centerAsn) {
      centerNode = nodeMap.get(centerAsn) || nodeMap.get(`${DN42.baseAsnPrefix}${centerAsn}`) || null
      if (centerNode && visibleNodeAsns && !visibleNodeAsns.has(centerNode.asn)) {
        centerNode = null
      }
    }
  
    if (!centerNode && nodes.length) {
      for (const node of nodes) {
        if (visibleNodeAsns && !visibleNodeAsns.has(node.asn)) continue
        if (!centerNode || node.centrality.index > centerNode.centrality.index) centerNode = node
      }
    }

    let cx = innerWidth / 2, cy = innerHeight / 2
    if (centerNode) {
      cx = centerNode.x || 0
      cy = centerNode.y || 0
    }

    const scale = RENDER.canvas.zoom.initial
    const tx = innerWidth / 2 - cx * scale
    const ty = innerHeight / 2 - cy * scale
    select(canvas).call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale))
    return centerNode
  }

  function enableZoom() {
    select(store.getCanvas()!).call(zoomBehavior).on('dblclick.zoom', null)
  }

  function disableZoom() {
    select(store.getCanvas()!).on('.zoom', null)
  }

  function animateToNode(node: MapNode) {
    const canvas = store.getCanvas()!
    const scale = store.state.transform.k
    const tx = innerWidth / 2 - node.x * scale
    const ty = innerHeight / 2 - node.y * scale
    select(canvas).transition().duration(TIMING.navigateAnimationMs)
      .call(zoomBehavior.transform, zoomIdentity.translate(tx, ty).scale(scale))
  }

  const onResize = debounce(() => {
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
      sim.alpha(RENDER.d3force.resizeReheatAlpha).restart()
    }
  }, TIMING.resizeDebounceMs)

  return { initCanvas, draw, setInitialScale, enableZoom, disableZoom, animateToNode, onResize }
}
