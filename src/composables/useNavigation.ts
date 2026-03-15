import { DN42 } from '@/constants'
import type { MapNode } from '@/types'
import type { useMapStore } from '@/stores/mapStore'
import type { useCanvas } from './useCanvas'

interface NavigationDeps {
  store: ReturnType<typeof useMapStore>
  canvas: ReturnType<typeof useCanvas>
  openNodeSidebar: (node: MapNode) => void
  closeSidebar: () => void
  draw: () => void
  t: (key: string) => string
  /** Called when a navigation target is hidden by AF filter and requires reset */
  onAfReset: (node: MapNode) => void
}

export function useNavigation(deps: NavigationDeps) {
  const { store, canvas, openNodeSidebar, closeSidebar, draw, t, onAfReset } = deps

  /** Resolve a search query to a node (tries exact match, then with DN42 ASN prefix) */
  function resolveNode(query: string): MapNode | undefined {
    const q = query.toLowerCase()
    return store.state.nodeMap.get(q)
      || (!query.startsWith(DN42.baseAsnPrefix)
        ? store.state.nodeMap.get(`${DN42.baseAsnPrefix}${q}`)
        : undefined)
  }

  function isNodeVisible(node: MapNode): boolean {
    return !store.state.visibleNodeAsns || store.state.visibleNodeAsns.has(node.asn)
  }

  /** Pan/animate to a node and update URL hash + page title */
  function navigateToNode(node: MapNode) {
    store.setHoveredNode(node)
    if (location.hash !== `#${node.asn}`) location.hash = String(node.asn)
    if (node.x !== undefined && node.y !== undefined) canvas.animateToNode(node)
    document.title = `${node.desc} (AS${node.asn}) - ${t('pageTitle')}`
    draw()
  }

  /** Navigate to a node by ASN — triggers AF reset if the node is hidden */
  function navigateToAsn(asn: number) {
    const node = store.state.nodeMap.get(asn.toString())
    if (!node) return
    if (!isNodeVisible(node)) { onAfReset(node); return }
    navigateToNode(node)
    openNodeSidebar(node)
  }

  /** Search for a node by query string, alert if not found */
  function onSearch(value: string) {
    const node = resolveNode(value)
    if (!node) { alert(t('search.notFound')); return }
    if (!isNodeVisible(node)) { onAfReset(node); return }
    navigateToNode(node)
    openNodeSidebar(node)
  }

  /** Navigate to a node from URL hash fragment */
  function searchNodeByHash(hash: string) {
    const node = resolveNode(hash)
    if (!node) { clearSelection(); return }
    if (!isNodeVisible(node)) { onAfReset(node); return }
    navigateToNode(node)
    openNodeSidebar(node)
  }

  /** Clear all selection state, reset URL hash and page title */
  function clearSelection() {
    closeSidebar()
    store.setHoveredNode(null)
    draw()
    if (location.hash) history.pushState('', document.title, location.pathname + location.search)
    document.title = t('pageTitle')
  }

  /** Handle browser hashchange event */
  function onHashChange() {
    const hash = location.hash.slice(1)
    if (hash && store.state.nodeMap.size) searchNodeByHash(hash)
    else clearSelection()
  }

  return {
    resolveNode,
    isNodeVisible,
    navigateToNode,
    navigateToAsn,
    onSearch,
    searchNodeByHash,
    clearSelection,
    onHashChange,
  }
}
