<template>
  <div v-if="node" class="tooltip" :style="position">
    <div class="node-info">
      <div class="title">
        <span v-if="source" class="tag">{{ source }}</span>
        <b>{{ cleanDesc }} (AS{{ node.asn }})</b>
      </div>
      <p>Neighbors: {{ node.peers.size }}</p>
      <template v-if="node.routes.length">
        <p>Advertised routes:</p>
        <ul>
          <li v-for="route in node.routes" :key="route">{{ route }}</li>
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
