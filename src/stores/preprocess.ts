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

    // Parse routes
    const ipv4Routes: [number, string][] = []
    const ipv6Routes: [number, string][] = []

    if (raw.routes) {
      for (const route of raw.routes) {
        if (route.ipv4 != null) {
          ipv4Routes.push([route.length, `${ipv4FromUint32(route.ipv4)}/${route.length}`])
        } else if (route.ipv6 != null) {
          const ip = ipv6FromQuad32(route.ipv6.high_h32, route.ipv6.high_l32, route.ipv6.low_h32, route.ipv6.low_l32)
          ipv6Routes.push([route.length, `${ip}/${route.length}`])
        }
      }
    }

    ipv4Routes.sort((a, b) => a[0] - b[0])
    ipv6Routes.sort((a, b) => a[0] - b[0])

    const routes: string[] = []
    for (const [, r] of ipv4Routes) routes.push(r)
    for (const [, r] of ipv6Routes) routes.push(r)

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
