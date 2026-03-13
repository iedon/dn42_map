import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3'
import { RENDER } from '@/constants'
import type { MapNode, MapLink } from '@/types'

export function createSimulation(
  nodes: MapNode[],
  links: MapLink[],
  onTick: () => void,
  onEnd: () => void,
  getFilterRatio: () => number = () => 1,
) {
  const sim = forceSimulation<MapNode>(nodes)
    .force(
      'link',
      forceLink<MapNode, MapLink>(links)
        .id(d => d.asn as unknown as string)
        .distance(() => RENDER.d3force.linkDistance * getFilterRatio()),
    )
    .force('charge', forceManyBody<MapNode>()
      .strength(() => RENDER.d3force.manyBodyStrength * getFilterRatio()))
    .force('center', forceCenter(innerWidth / 2, innerHeight / 2))
    .alphaDecay(RENDER.d3force.alphaDecay)

  sim.on('tick', onTick)
  sim.on('end', onEnd)

  return sim
}
