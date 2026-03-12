<template>
  <div class="centrality">
    <div class="param">
      <div>Betweenness <strong>{{ node.centrality.betweenness.toFixed(5) }}</strong></div>
      <div>Closeness <strong>{{ node.centrality.closeness.toFixed(5) }}</strong></div>
      <div>Degree <strong>{{ node.centrality.degree }}</strong></div>
    </div>
    <div class="index">
      <span>Map.dn42 Index</span>
      <strong>{{ node.centrality.index }}</strong>
    </div>
    <div class="rank">
      <span>Rank</span>
      <strong># {{ node.centrality.ranking }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MapNode } from '@/types'

defineProps<{
  node: MapNode
}>()
</script>
