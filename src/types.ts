export interface IPv6Parts {
  high_h32: number
  high_l32: number
  low_h32: number
  low_l32: number
}

export interface RawRoute {
  length: number
  ipv4?: number
  ipv6?: IPv6Parts
}

export interface RawCentrality {
  degree: number
  betweenness: number
  closeness: number
  index: number
  ranking: number
}

export interface RawNode {
  asn: number
  desc: string
  routes: RawRoute[]
  routes_multicast: RawRoute[]
  centrality: RawCentrality
}

export interface RawLink {
  source: number
  target: number
  af: number
}

export interface RawMetadata {
  vendor: string
  generated_timestamp: number
  data_timestamp: number
  version: number
}

export interface RawGraph {
  metadata: RawMetadata
  nodes: RawNode[]
  links: RawLink[]
}

export interface MapNode {
  asn: number
  desc: string
  label: string
  routes: string[]
  routesMulticast: string[]
  centrality: RawCentrality
  peers: Set<number>
  size: number
  x: number
  y: number
  fx: number | null
  fy: number | null
  labelFontSize: number
  labelFontNormal: string
  labelFontBold: string
}

export interface MapLink {
  source: MapNode
  target: MapNode
  af: number
}

export interface Viewport {
  left: number
  right: number
  top: number
  bottom: number
}

export type LoadingState = 'fetching' | 'parsing' | 'rendering' | 'done'

// 0=ALL, 3=All Unicast, 12=All Multicast, 1=Unicast IPv4, 2=Unicast IPv6, 4=Multicast IPv4, 8=Multicast IPv6
type AF_ALL = 0
type AF_ALL_UCAST = 3
type AF_ALL_MCAST = 12
type AF_UCAST_IPV4 = 1
type AF_UCAST_IPV6 = 2
type AF_MCAST_IPV4 = 4
type AF_MCAST_IPV6 = 8
export const AF_FILTERS = {
  ALL: 0,
  AF_ALL_UCAST: 3,
  AF_ALL_MCAST: 12,
  AF_UCAST_IPV4: 1,
  AF_UCAST_IPV6: 2,
  AF_MCAST_IPV4: 4,
  AF_MCAST_IPV6: 8,
} as const
export type AfFilter = AF_ALL | AF_UCAST_IPV4 | AF_UCAST_IPV6 | AF_ALL_UCAST | AF_MCAST_IPV4 | AF_MCAST_IPV6 | AF_ALL_MCAST

export interface MyIpData {
  ip?: string
  country?: string
  netname?: string
  origin?: string
}

export interface TimeMachineVersions {
  [year: string]: {
    [month: string]: string[]
  }
}

export interface AppSettings {
  locale: string            // '' = browser preferred, or a locale code
  afFilter: AfFilter        // 0=ALL, 1=IPv4, 2=IPv6, 4=MCAST-IPv4, 8=MCAST-IPv6
  centerMode: 'index' | 'custom' // 'index' = highest Map.dn42 index, 'custom' = specific ASN
  centerAsn: string         // ASN number for custom center (digits only)
  autoShowNodeInfo: boolean // auto-open sidebar for center node after load
}
