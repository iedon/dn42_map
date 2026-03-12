import { parse } from 'protobufjs'
import { BIN_VENDOR_MAGIC, DN42 } from './constants'
import type { RawGraph, MyIpData, TimeMachineVersions } from './types'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }

const PROTO_DEF = 'syntax="proto3";package dn42_map;message Node{uint32 asn=1;string desc=2;repeated Route routes=3;Centrality centrality=4;}message Centrality{double degree=1;double betweenness=2;double closeness=3;uint32 index=4;uint32 ranking=5;}message Route{uint32 length=1;oneof ip{uint32 ipv4=2;IPv6 ipv6=3;}}message IPv6{uint32 high_h32=1;uint32 high_l32=2;uint32 low_h32=3;uint32 low_l32=4;}message Link{uint32 source=1;uint32 target=2;uint32 af=3;}message Metadata{string vendor=1;uint64 generated_timestamp=2;uint64 data_timestamp=3;uint32 version=4;}message Graph{Metadata metadata=1;repeated Node nodes=2;repeated Link links=3;}'

export async function fetchGraphData(url?: string | null): Promise<RawGraph> {
  const response = await fetch(url || 'map.bin')

  if (response.status === 503) {
    throw new Error(await response.text() || 'Service unavailable')
  }
  if (!response.ok) throw new Error('Failed to fetch graph data.')

  const graphType = parse(PROTO_DEF, { keepCase: true }).root.lookupType('dn42_map.Graph')
  const data = graphType.toObject(
    graphType.decode(new Uint8Array(await response.arrayBuffer())),
  ) as unknown as RawGraph

  if (data.metadata.vendor !== BIN_VENDOR_MAGIC) {
    throw new Error('Invalid response or map provider.')
  }

  return data
}

export async function fetchWhoisData(asn: number): Promise<string> {
  const response = await fetch(`${DN42.whoisApi}${asn}`, { headers: NO_CACHE_HEADERS })
  if (!response.ok) throw new Error('Network status code error.')

  const data = await response.json()
  if (!data.whois) throw new Error('Network response error.')
  return data.whois as string
}

export async function fetchMyIpData(): Promise<MyIpData> {
  const response = await fetch(DN42.myIpApi, { headers: NO_CACHE_HEADERS })
  if (!response.ok) throw new Error('Failed to fetch myip data.')

  const data = await response.json()
  if (!data.ip) throw new Error('Network response error.')
  return data as MyIpData
}

export async function fetchMapVersions(): Promise<TimeMachineVersions> {
  const response = await fetch(`${DN42.timeMachineBinUrlPrefix}/index.json`, { headers: NO_CACHE_HEADERS })
  if (!response.ok) throw new Error('Failed to fetch map versions.')
  return await response.json()
}
