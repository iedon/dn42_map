import { toRaw, type Ref } from 'vue'
import { useMapStore } from '@/stores/mapStore'
import { throttle } from '@/utils/timing'
import type { MapNode } from '@/types'

interface PointerOptions {
  store: ReturnType<typeof useMapStore>
  sidebarOpen: Ref<boolean>
  tooltip: { node: Ref<MapNode | null>; x: Ref<number>; y: Ref<number> }
  draw: () => void
  enableZoom: () => void
  disableZoom: () => void
  onNodeClick: (node: MapNode) => void
  onRightClick: () => void
}

export function usePointer(opts: PointerOptions) {
  const { store, sidebarOpen, tooltip, draw, enableZoom, disableZoom, onNodeClick, onRightClick } = opts

  let focusingNode: MapNode | null = null
  let draggingNode: MapNode | null = null
  let pointerIsDown = false
  let showingTooltip = false

  function getCoord(event: PointerEvent): [number, number] {
    const canvas = store.getCanvas()!
    const rect = canvas.getBoundingClientRect()
    return store.state.transform.invert([
      event.pageX - (rect.left + (scrollX || document.documentElement.scrollLeft)),
      event.pageY - (rect.top + (scrollY || document.documentElement.scrollTop)),
    ]) as [number, number]
  }

  function findClosestNode(x: number, y: number): MapNode | null {
    let minDistSq = 225
    let closest: MapNode | null = null
    const raw = toRaw(store.state)
    const { visibleNodeAsns, nodes } = raw

    for (const node of nodes) {
      if (visibleNodeAsns && !visibleNodeAsns.has(node.asn)) continue
      const dx = node.x - x
      const dy = node.y - y
      const distSq = dx * dx + dy * dy
      if (distSq < minDistSq) {
        minDistSq = distSq
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
      store.getSimulation()?.alphaTarget(0.1 * store.state.filterRatio).restart()
      focusingNode = null
    }

    if (draggingNode) {
      if (showingTooltip) { tooltip.node.value = null; showingTooltip = false }
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
        tooltip.node.value = hovered
        tooltip.x.value = event.clientX
        tooltip.y.value = event.clientY
        showingTooltip = true
      } else {
        tooltip.node.value = null
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
      if (node) onNodeClick(node)
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

  function handleContextMenu(e: Event) {
    e.preventDefault()
    onRightClick()
  }

  function bind(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    canvas.addEventListener('contextmenu', handleContextMenu)
  }

  function unbind(canvas: HTMLCanvasElement | null) {
    if (!canvas) return
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointerleave', onPointerLeave)
    canvas.removeEventListener('contextmenu', handleContextMenu)
  }

  return { bind, unbind }
}
