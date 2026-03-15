<template>
  <div class="table-search-container">
    <input
      type="text"
      class="table-search"
      :placeholder="$t('rankingView.searchPlaceholder')"
      @input="onQueryInput"
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
import { useI18n } from 'vue-i18n'
import { debounce } from '@/utils/timing'
import { TIMING } from '@/constants'
import SortableTable from './SortableTable.vue'
import type { Column } from './SortableTable.vue'
import type { MapNode } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  nodes: MapNode[]
}>()

const emit = defineEmits<{
  navigateAsn: [asn: number]
}>()

const query = ref('')
const onQueryInput = debounce((e: Event) => {
  query.value = (e.target as HTMLInputElement).value
}, TIMING.searchDebounceMs)

const columns = computed<Column[]>(() => [
  { key: 'rank', label: t('columns.rank'), type: 'number' },
  { key: 'asn', label: t('columns.asn'), type: 'number', searchable: true },
  { key: 'name', label: t('columns.name'), searchable: true },
  { key: 'index', label: t('columns.index'), type: 'number' },
])

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
