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
    <a :href="`${DN42.explorerUrl}${node.asn}`" target="_blank">{{ $t('nodeDetail.revealExplorer') }}</a><br>
    <div class="whois" v-html="whoisHtml" />
  </template>

  <!-- Routes -->
  <p class="emphasized">{{ $t('nodeDetail.routes', { count: node.routes.length }) }}</p>
  <div class="whois">
    <table>
      <tbody>
        <tr v-for="route in node.routes" :key="route">
          <td class="mono">{{ route }}</td>
          <td class="right">
            <a :href="`${DN42.explorerUrl}${route.replace('/', '_')}`" target="_blank">{{ $t('nodeDetail.registry') }}</a>&nbsp;&nbsp;
            <a :href="`${DN42.routeGraphsUrl}?ip_prefix=${encodeURIComponent(route)}&asn=${DN42.routeGraphInitiateAsn}`" target="_blank">{{ $t('nodeDetail.graph') }}</a>&nbsp;&nbsp;
            <a :href="`${DN42.queryRoutesUrl}${route}`" target="_blank">{{ $t('nodeDetail.show') }}</a>
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
      @input="neighborsQuery = ($event.target as HTMLInputElement).value"
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
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import CentralityCard from './CentralityCard.vue'
import SortableTable from './SortableTable.vue'
import type { Column } from './SortableTable.vue'
import { DN42 } from '@/constants'
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

const neighborsQuery = ref('')
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
    const html = parseWhois(raw)
    whoisCache.set(asn, html)
    whoisHtml.value = html
  } catch {
    whoisError.value = true
  } finally {
    whoisLoading.value = false
  }
}

function parseWhois(whois: string): string {
  const urlRegex = /(https?:\/\/)([\w=?.\/&-]+)/g
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

  let remarks = '<div class="remarks">'
  const rows: string[] = []

  for (const line of whois.split('\n')) {
    const [k, v] = line.split(/:\x20(.+)?/, 2)
    if (!k || !v) continue

    const vv = v.trim()
      .replace(urlRegex, "<a href='$1$2' target='_blank'>$1$2</a>")
      .replace(emailRegex, email => `<a href="mailto:${email}">${email}</a>`)

    if (k.trim() === 'remarks') {
      if (!vv) continue
      const remark = vv.replace(/(<a\b[^>]*>.*?<\/a>)|\x20/g, (_, g1) => g1 ? g1 : '&nbsp;')
      remarks += `<p>${remark}</p>`
    } else {
      rows.push(`<tr><td class="key">${k.trim()}</td><td>${vv}</td></tr>`)
    }
  }
  remarks += '</div>'

  return `<table><tbody>${rows.join('')}</tbody></table>${remarks}`
}

watch(() => props.node.asn, asn => loadWhois(asn), { immediate: true })
</script>
