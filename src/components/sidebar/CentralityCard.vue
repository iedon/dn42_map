<template>
  <div class="centrality">
    <div class="param">
      <div>{{ $t('centrality.betweenness') }} <strong>{{ node.centrality.betweenness.toFixed(5) }}</strong></div>
      <div>{{ $t('centrality.closeness') }} <strong>{{ node.centrality.closeness.toFixed(5) }}</strong></div>
      <div>{{ $t('centrality.degree') }} <strong>{{ node.centrality.degree }}</strong></div>
    </div>
    <div class="index">
      <span>{{ $t('centrality.index') }}</span>
      <strong>{{ node.centrality.index }}</strong>
    </div>
    <div class="rank">
      <span>{{ $t('centrality.rank') }}</span>
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
