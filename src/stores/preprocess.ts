import type { RawGraph, MapNode, MapLink } from '@/types'
import { ipv4FromUint32, ipv6FromQuad32 } from '@/utils/ip'
import { scaleSqrt } from '@/utils/scale'
import { RENDER } from '@/constants'

const SUFFIX_PATTERNS = ['-DN42', '-MNT', '-AS', '-NEONETWORK', 'ICVPN-', '-CRXN']

function cleanLabel(desc: string): string {
  let label = desc
  for (const p of SUFFIX_PATTERNS) label = label.replace(p, '')
  return label
}

export function preprocessDataset(data: RawGraph) {
  const nodes: MapNode[] = []
  const nodeMap = new Map<string, MapNode>()
  const linkMap = new Map<string, boolean>()

  // Build nodes
  for (const raw of data.nodes) {
    const asn = raw.asn || 0
    const label = cleanLabel(raw.desc)

    // Parse unicast routes — sort raw arrays in-place before formatting to avoid tuple allocations
    const routes: string[] = []
    if (raw.routes?.length) {
      const v4: typeof raw.routes = []
      const v6: typeof raw.routes = []
      for (const route of raw.routes) {
        if (route.ipv4 != null) v4.push(route)
        else if (route.ipv6 != null) v6.push(route)
      }
      v4.sort((a, b) => a.length - b.length)
      v6.sort((a, b) => a.length - b.length)
      for (const r of v4) routes.push(`${ipv4FromUint32(r.ipv4!)}/${r.length}`)
      for (const r of v6) routes.push(`${ipv6FromQuad32(r.ipv6!.high_h32, r.ipv6!.high_l32, r.ipv6!.low_h32, r.ipv6!.low_l32)}/${r.length}`)
    }

    // Parse multicast routes
    const routesMulticast: string[] = []
    if (raw.routes_multicast?.length) {
      const v4: typeof raw.routes_multicast = []
      const v6: typeof raw.routes_multicast = []
      for (const route of raw.routes_multicast) {
        if (route.ipv4 != null) v4.push(route)
        else if (route.ipv6 != null) v6.push(route)
      }
      v4.sort((a, b) => a.length - b.length)
      v6.sort((a, b) => a.length - b.length)
      for (const r of v4) routesMulticast.push(`${ipv4FromUint32(r.ipv4!)}/${r.length}`)
      for (const r of v6) routesMulticast.push(`${ipv6FromQuad32(r.ipv6!.high_h32, r.ipv6!.high_l32, r.ipv6!.low_h32, r.ipv6!.low_l32)}/${r.length}`)
    }

    const centrality = {
      degree: raw.centrality?.degree || 0,
      betweenness: raw.centrality?.betweenness || 0,
      closeness: raw.centrality?.closeness || 0,
      index: raw.centrality?.index || 0,
      ranking: raw.centrality?.ranking || 0,
    }

    const fontSize = scaleSqrt(
      [0, RENDER.node.labelFontSizeMaxPx],
      [RENDER.node.labelFontSizePx / 4, RENDER.node.labelFontSizePx],
      RENDER.node.labelFontSizeMaxPx - label.length * 0.5,
    )

    const node: MapNode = {
      asn,
      desc: raw.desc,
      label,
      routes,
      routesMulticast,
      centrality,
      peers: new Set(),
      size: RENDER.node.minSize,
      x: 0,
      y: 0,
      fx: null,
      fy: null,
      labelFontSize: fontSize,
      labelFontNormal: `${fontSize}px ${RENDER.node.labelFontFamily}`,
      labelFontBold: `bold ${fontSize}px ${RENDER.node.labelFontFamily}`,
    }

    nodes.push(node)
    nodeMap.set(asn.toString(), node)
    nodeMap.set(label.toLowerCase(), node)
  }

  // Build links & deduplicate
  const links: MapLink[] = []
  const deduplicatedLinks: MapLink[] = []
  const seenLinks = new Map<string, MapLink>()

  for (const raw of data.links) {
    const source = nodes[raw.source ?? 0]
    const target = nodes[raw.target ?? 0]
    const af = raw.af || 0

    source.peers.add(target.asn)
    target.peers.add(source.asn)
    linkMap.set(`${source.asn}_${target.asn}`, true)

    const link: MapLink = { source, target, af }
    links.push(link)

    const key = source.asn < target.asn
      ? `${source.asn}-${target.asn}`
      : `${target.asn}-${source.asn}`

    const existing = seenLinks.get(key)
    if (existing) {
      existing.af |= af
    } else {
      seenLinks.set(key, link)
      deduplicatedLinks.push(link)
    }
  }

  // Scale node sizes
  for (const node of nodes) {
    let size = scaleSqrt(RENDER.node.scaleSqrtDomain, RENDER.node.scaleSqrtRange, node.centrality.index) || RENDER.node.minSize
    node.size = Math.min(RENDER.node.maxSize, Math.max(RENDER.node.minSize, size))
  }

  return { nodes, links, deduplicatedLinks, nodeMap, linkMap }
}
