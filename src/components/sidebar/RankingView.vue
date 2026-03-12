<template>
  <div class="table-search-container">
    <input
      type="text"
      class="table-search"
      placeholder="Search by ASN or Name..."
      @input="query = ($event.target as HTMLInputElement).value"
    >
  </div>
  <SortableTable
    :columns="columns"
    :rows="rows"
    :row-key="r => r.asn"
    :search-query="query"
    @row-click="r => $emit('navigateAsn', r.asn)"
  />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import SortableTable from './SortableTable.vue'
import type { Column } from './SortableTable.vue'
import type { MapNode } from '@/types'

const props = defineProps<{
  nodes: MapNode[]
}>()

const emit = defineEmits<{
  navigateAsn: [asn: number]
}>()

const query = ref('')

const columns: Column[] = [
  { key: 'rank', label: 'Rank', type: 'number' },
  { key: 'asn', label: 'ASN', type: 'number', searchable: true },
  { key: 'name', label: 'Name', searchable: true },
  { key: 'index', label: 'Index', type: 'number' },
]

const rows = computed(() =>
  [...props.nodes]
    .sort((a, b) => a.centrality.ranking - b.centrality.ranking)
    .map((node, i) => ({
      rank: i + 1,
      asn: node.asn,
      name: node.label || '-',
      index: node.centrality.index,
    })),
)
</script>
