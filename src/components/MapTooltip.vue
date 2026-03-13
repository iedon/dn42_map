<template>
  <div v-if="node" class="tooltip" :style="position">
    <div class="node-info">
      <div class="title">
        <span v-if="source" class="tag">{{ source }}</span>
        <b>{{ cleanDesc }} (AS{{ node.asn }})</b>
      </div>
      <p>{{ $t('tooltip.neighbors', { count: node.peers.size }) }}</p>
      <template v-if="mergedRoutes.length">
        <p>{{ $t('tooltip.advertisedRoutes') }}</p>
        <ul>
          <li v-for="r in mergedRoutes" :key="r.route">
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
import { computed, reactive } from 'vue'
import type { MapNode } from '@/types'

const props = defineProps<{
  node: MapNode | null
  mouseX: number
  mouseY: number
}>()

const position = computed(() => ({
  left: `${props.mouseX + 10}px`,
  top: `${props.mouseY + 10}px`,
}))

const mergedRoutes = computed(() => {
  if (!props.node) return []
  const map = new Map<string, { u: boolean, m: boolean }>()
  for (const r of props.node.routes) map.set(r, { u: true, m: false })
  for (const r of props.node.routesMulticast) {
    const e = map.get(r)
    if (e) e.m = true
    else map.set(r, { u: false, m: true })
  }
  return [...map.entries()].map(([route, f]) => ({ route, ...f }))
})

const source = computed(() => {
  if (!props.node) return ''
  const d = props.node.desc
  if (d.includes('-DN42')) return 'DN42'
  if (d.includes('-NEONETWORK')) return 'NEONETWORK'
  if (d.includes('ICVPN-')) return 'ICVPN'
  if (d.includes('-CRXN')) return 'CRXN'
  return ''
})

const cleanDesc = computed(() => {
  if (!props.node) return ''
  return props.node.desc
    .replace('-DN42', '')
    .replace('-NEONETWORK', '')
    .replace('ICVPN-', '')
    .replace('-CRXN', '')
})
</script>
