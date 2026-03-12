<template>
  <div class="whois">
    <table class="sortable">
      <thead>
        <tr>
          <th
            v-for="(col, i) in columns"
            :key="col.key"
            :class="[col.key, 'key', sortColumn === i ? (sortAsc ? 'sort-asc' : 'sort-desc') : '']"
            @click="toggleSort(i, col.type)"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in sortedRows"
          :key="rowKey(row)"
          :style="{ display: isRowVisible(row) ? '' : 'none' }"
          @click="$emit('rowClick', row)"
        >
          <td v-for="col in columns" :key="col.key" :class="col.key">
            <slot :name="col.key" :row="row" :value="row[col.key]">
              {{ row[col.key] }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

export interface Column {
  key: string
  label: string
  type?: 'number' | 'string'
  searchable?: boolean
}

const props = defineProps<{
  columns: Column[]
  rows: Record<string, any>[]
  rowKey: (row: Record<string, any>) => string | number
  searchQuery?: string
}>()

defineEmits<{
  rowClick: [row: Record<string, any>]
}>()

const sortColumn = ref(0)
const sortAsc = ref(true)

function toggleSort(col: number, type?: string) {
  if (sortColumn.value === col) {
    sortAsc.value = !sortAsc.value
  } else {
    sortColumn.value = col
    sortAsc.value = true
  }
}

const sortedRows = computed(() => {
  const col = props.columns[sortColumn.value]
  if (!col) return props.rows

  const dir = sortAsc.value ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const av = a[col.key]
    const bv = b[col.key]
    if (col.type === 'number') return (Number(av) - Number(bv)) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
})

function isRowVisible(row: Record<string, any>): boolean {
  const q = props.searchQuery?.toLowerCase().trim()
  if (!q) return true

  const searchCols = props.columns.filter(c => c.searchable)
  const cols = searchCols.length ? searchCols : props.columns

  return cols.some(col => String(row[col.key]).toLowerCase().includes(q))
}
</script>
