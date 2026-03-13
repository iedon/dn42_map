import { ref, nextTick } from 'vue'
import type { MapNode } from '@/types'

export function useSidebar(t: (key: string) => string) {
  const sidebarOpen = ref(false)
  const sidebarNode = ref<MapNode | null>(null)
  const showRanking = ref(false)
  const sidebarTitle = ref('')

  function openNodeSidebar(node: MapNode) {
    sidebarNode.value = node
    showRanking.value = false
    sidebarTitle.value = node.desc
    sidebarOpen.value = true
    nextTick(() => document.querySelector('.sidebar')?.scrollTo(0, 0))
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

  return { sidebarOpen, sidebarNode, showRanking, sidebarTitle, openNodeSidebar, toggleRanking, closeSidebar }
}
