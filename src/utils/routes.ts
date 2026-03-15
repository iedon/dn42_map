import type { RawRoute } from '@/types'
import { ipv4FromUint32, ipv6FromQuad32 } from './ip'

export interface MergedRoute {
  route: string
  u: boolean
  m: boolean
}

/** Parse raw protobuf routes into CIDR strings, sorted IPv4-first then IPv6 by prefix length */
export function formatRawRoutes(raw: RawRoute[] | undefined): string[] {
  if (!raw?.length) return []

  const v4: RawRoute[] = []
  const v6: RawRoute[] = []
  for (const r of raw) {
    if (r.ipv4 != null) v4.push(r)
    else if (r.ipv6 != null) v6.push(r)
  }

  v4.sort((a, b) => a.length - b.length)
  v6.sort((a, b) => a.length - b.length)

  const result: string[] = []
  for (const r of v4) result.push(`${ipv4FromUint32(r.ipv4!)}/${r.length}`)
  for (const r of v6) {
    const { high_h32, high_l32, low_h32, low_l32 } = r.ipv6!
    result.push(`${ipv6FromQuad32(high_h32, high_l32, low_h32, low_l32)}/${r.length}`)
  }
  return result
}

/** Merge unicast and multicast route lists, tagging each with u/m flags */
export function mergeRoutes(unicast: string[], multicast: string[]): MergedRoute[] {
  const map = new Map<string, MergedRoute>()
  for (const r of unicast) map.set(r, { route: r, u: true, m: false })
  for (const r of multicast) {
    const existing = map.get(r)
    if (existing) existing.m = true
    else map.set(r, { route: r, u: false, m: true })
  }
  return [...map.values()]
}
