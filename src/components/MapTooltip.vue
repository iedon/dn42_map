<template>
  <div v-if="node" class="tooltip" :style="position">
    <div class="node-info">
      <div class="title">
        <span v-if="source" class="tag">{{ source }}</span>
        <b>{{ node.label }} (AS{{ node.asn }})</b>
      </div>
      <p>{{ $t('tooltip.neighbors', { count: node.peers.size }) }}</p>
      <template v-if="mergedRouteList.length">
        <p>{{ $t('tooltip.advertisedRoutes') }}</p>
        <ul>
          <li v-for="r in mergedRouteList" :key="r.route">
            <span v-if="r.u" class="route-tag" :title="$t('nodeDetail.unicast')">U</span>
            <span v-if="r.m" class="route-tag route-tag-mcast" :title="$t('nodeDetail.multicast')">M</span>
            {{ r.route }}
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RENDER } from '@/constants'
import type { MapNode } from '@/types'
import { mergeRoutes } from '@/utils/routes'

/** Network identifier patterns to detect source network from node description */
const NETWORK_TAGS: [string, string][] = [
  ['-DN42', 'DN42'],
  ['-NEONETWORK', 'NEONETWORK'],
  ['ICVPN-', 'ICVPN'],
  ['-CRXN', 'CRXN'],
]

const props = defineProps<{
  node: MapNode | null
  mouseX: number
  mouseY: number
}>()

const position = computed(() => ({
  left: `${props.mouseX + RENDER.tooltip.offsetPx}px`,
  top: `${props.mouseY + RENDER.tooltip.offsetPx}px`,
}))

const mergedRouteList = computed(() =>
  props.node ? mergeRoutes(props.node.routes, props.node.routesMulticast) : [],
)

const source = computed(() => {
  if (!props.node) return ''
  for (const [pattern, name] of NETWORK_TAGS) {
    if (props.node.desc.includes(pattern)) return name
  }
  return ''
})
</script>
