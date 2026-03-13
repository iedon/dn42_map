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

export type AfFilter = number

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
