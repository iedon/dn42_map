import { RENDER } from '@/constants'
import { scaleSqrt } from '@/utils/scale'
import type { MapNode, MapLink, Viewport } from '@/types'
import type { ZoomTransform } from 'd3'

const FRAME_INTERVAL = 1000 / RENDER.node.maxFPS
let lastFrameTime = 0

const LINK_COLOR_DEFAULT = RENDER.link.colorDefault
const LINK_COLOR_EMPHASIS = RENDER.link.colorEmphasize
const LINK_WIDTH_DEFAULT = RENDER.link.widthDefault
const LINK_WIDTH_EMPHASIS = RENDER.link.widthEmphasize
const NODE_COLOR_CURRENT = RENDER.node.colorCurrent
const NODE_COLOR_LINKED = RENDER.node.colorLinked
const NODE_COLOR_DEFAULT = RENDER.node.colorDefault
const LABEL_COLOR = RENDER.node.labelColor
const BG_COLOR = RENDER.canvas.backgroundColor
const BORDER_COLOR = RENDER.node.borderColor
const BORDER_WIDTH = RENDER.node.borderWidth
const VIEWPORT_MARGIN = RENDER.canvas.viewportMargin
const TWO_PI = Math.PI * 2
const { baseZoomThreshold, highZoomThreshold, maxLabelsInView, importanceThresholdRange } = RENDER.node.labelCulling

function calcViewport(canvas: HTMLCanvasElement, t: ZoomTransform): Viewport {
  const pr = RENDER.pixelRatio
  return {
    left: -t.x / t.k - VIEWPORT_MARGIN,
    right: (canvas.width / pr - t.x) / t.k + VIEWPORT_MARGIN,
    top: -t.y / t.k - VIEWPORT_MARGIN,
    bottom: (canvas.height / pr - t.y) / t.k + VIEWPORT_MARGIN,
  }
}

function inView(x: number, y: number, v: Viewport, pad = 0): boolean {
  return x >= v.left - pad && x <= v.right + pad && y >= v.top - pad && y <= v.bottom + pad
}

export function renderFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  transform: ZoomTransform,
  deduplicatedLinks: MapLink[],
  visibleNodes: MapNode[],
  hoveredNode: MapNode | null,
  afFilter: number,
  visibleNodeAsns: Set<number> | null,
): void {
  // Throttle rendering to max FPS
  const now = performance.now()
  if (now - lastFrameTime < FRAME_INTERVAL) return
  lastFrameTime = now

  // Calculate viewport once per frame for efficient culling
  const vp = calcViewport(canvas, transform)
  const zoom = transform.k

  // Clear
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Save context and apply zoom/pan transform
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(zoom, zoom)

  // -- Links --
  const emphasizedLinks: MapLink[] = []
  ctx.strokeStyle = LINK_COLOR_DEFAULT
  ctx.lineWidth = LINK_WIDTH_DEFAULT

  for (const link of deduplicatedLinks) {
    if (afFilter && !(link.af & afFilter)) continue

    if (!inView(link.source.x, link.source.y, vp) &&
      !inView(link.target.x, link.target.y, vp)) continue

    if (hoveredNode && (link.source === hoveredNode || link.target === hoveredNode)) {
      emphasizedLinks.push(link)
    } else {
      ctx.beginPath()
      ctx.moveTo(link.source.x, link.source.y)
      ctx.lineTo(link.target.x, link.target.y)
      ctx.stroke()
    }
  }

  if (emphasizedLinks.length) {
    ctx.strokeStyle = LINK_COLOR_EMPHASIS
    ctx.lineWidth = LINK_WIDTH_EMPHASIS
    for (const link of emphasizedLinks) {
      ctx.beginPath()
      ctx.moveTo(link.source.x, link.source.y)
      ctx.lineTo(link.target.x, link.target.y)
      ctx.stroke()
    }
  }

  // -- Nodes + label collection --
  let eligibleLabels: MapNode[] = []

  // When AF-filtered, derive peers from the already-filtered emphasizedLinks
  // to avoid highlighting nodes not connected via the active address family.
  let hoveredPeers: Set<number> | undefined
  if (hoveredNode) {
    if (afFilter && emphasizedLinks.length) {
      hoveredPeers = new Set<number>()
      for (const link of emphasizedLinks) {
        hoveredPeers.add(link.source === hoveredNode ? link.target.asn : link.source.asn)
      }
    } else {
      hoveredPeers = hoveredNode.peers
    }
  }

  if (zoom >= baseZoomThreshold) {
    const threshold = scaleSqrt(
      [baseZoomThreshold, highZoomThreshold],
      importanceThresholdRange,
      zoom,
    )
    for (const node of visibleNodes) {
      if (!inView(node.x, node.y, vp)) continue
      if (visibleNodeAsns && !visibleNodeAsns.has(node.asn)) continue

      if (
        node === hoveredNode ||
        zoom >= highZoomThreshold ||
        node.centrality.index >= threshold ||
        hoveredPeers?.has(node.asn)
      ) {
        eligibleLabels.push(node)
      }
    }

    if (eligibleLabels.length > maxLabelsInView) {
      eligibleLabels.sort((a, b) => b.centrality.index - a.centrality.index)
      eligibleLabels = eligibleLabels.slice(
        0,
        Math.min(maxLabelsInView, Math.floor(maxLabelsInView * (zoom / highZoomThreshold))),
      )
    }
  }

  // Draw nodes
  ctx.strokeStyle = BORDER_COLOR
  ctx.lineWidth = BORDER_WIDTH
  for (const node of visibleNodes) {
    if (!inView(node.x, node.y, vp)) continue
    if (visibleNodeAsns && !visibleNodeAsns.has(node.asn)) continue
    

    ctx.fillStyle =
      node === hoveredNode ? NODE_COLOR_CURRENT
        : hoveredPeers?.has(node.asn) ? NODE_COLOR_LINKED
          : NODE_COLOR_DEFAULT

    ctx.beginPath()
    ctx.arc(node.x, node.y, node.size, 0, TWO_PI)
    ctx.fill()
    ctx.stroke()
  }

  // -- Labels --
  if (eligibleLabels.length) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = LABEL_COLOR

    for (const node of eligibleLabels) {
      ctx.font = node === hoveredNode ? node.labelFontBold : node.labelFontNormal
      ctx.fillText(node.label, node.x, node.y + node.size + node.labelFontSize / 2 + 4)
    }
  }

  ctx.restore()
}
