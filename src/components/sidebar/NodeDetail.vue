<template>
  <CentralityCard :node="node" />

  <!-- WHOIS -->
  <template v-if="whoisLoading">
    <p>{{ $t('nodeDetail.queryingWhois') }}</p>
  </template>
  <template v-else-if="whoisError">
    <p>{{ $t('nodeDetail.whoisError') }}</p>
  </template>
  <template v-else-if="whoisHtml">
    <a :href="`${DN42.explorerUrl}${node.asn}`" target="_blank" class="reval">{{ $t('nodeDetail.revealExplorer') }}</a><br>
    <div class="whois" v-html="whoisHtml" />
  </template>

  <!-- Routes -->
  <p class="emphasized">{{ $t('nodeDetail.routes', { count: mergedRoutes.length }) }}</p>
  <div class="whois">
    <table class="route-table">
      <tbody>
        <tr v-for="r in mergedRoutes" :key="r.route">
          <td class="mono">
            <span v-if="r.u" class="route-tag" :data-tooltip="$t('nodeDetail.unicast')">U</span>
            <span v-if="r.m" class="route-tag route-tag-mcast" :data-tooltip="$t('nodeDetail.multicast')">M</span>
            {{ r.route }}
          </td>
          <td class="right">
            <a :href="`${DN42.explorerUrl}${r.route.replace('/', '_')}`" target="_blank">{{ $t('nodeDetail.registry') }}</a>&nbsp;&nbsp;
            <a :href="`${DN42.routeGraphsUrl}?ip_prefix=${encodeURIComponent(r.route)}&asn=${DN42.routeGraphInitiateAsn}`" target="_blank">{{ $t('nodeDetail.graph') }}</a>&nbsp;&nbsp;
            <a :href="`${DN42.queryRoutesUrl}${r.route}`" target="_blank">{{ $t('nodeDetail.show') }}</a>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Neighbors -->
  <p class="emphasized">{{ $t('nodeDetail.neighbors', { count: node.peers.size }) }}</p>
  <div class="table-search-container">
    <input
      type="text"
      class="table-search"
      :placeholder="$t('nodeDetail.searchNeighbors')"
      @input="onNeighborSearch"
    >
  </div>
  <SortableTable
    :columns="neighborColumns"
    :rows="neighborRows"
    :row-key="r => r.asn"
    :search-query="neighborsQuery"
    @row-click="r => $emit('navigateAsn', r.asn)"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { debounce } from '@/utils/timing'
import { mergeRoutes } from '@/utils/routes'
import { parseWhoisHtml } from '@/utils/whois'
import CentralityCard from './CentralityCard.vue'
import SortableTable from './SortableTable.vue'
import type { Column } from './SortableTable.vue'
import { DN42, TIMING } from '@/constants'
import { fetchWhoisData } from '@/api'
import { useMapStore } from '@/stores/mapStore'
import type { MapNode } from '@/types'

const { t } = useI18n()

const props = defineProps<{
  node: MapNode
}>()

const emit = defineEmits<{
  navigateAsn: [asn: number]
}>()

const { state } = useMapStore()

const mergedRoutes = computed(() =>
  mergeRoutes(props.node.routes, props.node.routesMulticast),
)

const neighborsQuery = ref('')
const onNeighborSearch = debounce((e: Event) => {
  neighborsQuery.value = (e.target as HTMLInputElement).value
}, TIMING.searchDebounceMs)
const whoisLoading = ref(false)
const whoisError = ref(false)
const whoisHtml = ref('')
const whoisCache = new Map<number, string>()

const neighborColumns = computed<Column[]>(() => [
  { key: 'asn', label: t('columns.asn'), type: 'number', searchable: true },
  { key: 'name', label: t('columns.name'), searchable: true },
  { key: 'to', label: t('columns.sendsTransit') },
  { key: 'from', label: t('columns.recvsTransit') },
])

const neighborRows = computed(() =>
  [...props.node.peers].map(peerAsn => ({
    asn: peerAsn,
    name: state.nodeMap.get(peerAsn.toString())?.label || '-',
    to: state.linkMap.has(`${peerAsn}_${props.node.asn}`) ? '\u2714' : '',
    from: state.linkMap.has(`${props.node.asn}_${peerAsn}`) ? '\u2714' : '',
  })),
)

async function loadWhois(asn: number) {
  if (whoisCache.has(asn)) {
    whoisHtml.value = whoisCache.get(asn)!
    return
  }

  whoisLoading.value = true
  whoisError.value = false
  whoisHtml.value = ''

  try {
    const raw = await fetchWhoisData(asn)
    const html = parseWhoisHtml(raw)
    whoisCache.set(asn, html)
    whoisHtml.value = html
  } catch {
    whoisError.value = true
  } finally {
    whoisLoading.value = false
  }
}

watch(() => props.node.asn, asn => loadWhois(asn), { immediate: true })
</script>
