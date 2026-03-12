import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3'
import { RENDER } from '@/constants'
import type { MapNode, MapLink } from '@/types'

export function createSimulation(
  nodes: MapNode[],
  links: MapLink[],
  onTick: () => void,
  onEnd: () => void,
) {
  const sim = forceSimulation<MapNode>(nodes)
    .force(
      'link',
      forceLink<MapNode, MapLink>(links)
        .id(d => d.asn as unknown as string)
        .distance(RENDER.d3force.linkDistance),
    )
    .force('charge', forceManyBody().strength(RENDER.d3force.manyBodyStrength))
    .force('center', forceCenter(innerWidth / 2, innerHeight / 2))
    .alphaDecay(RENDER.d3force.alphaDecay)

  sim.on('tick', onTick)
  sim.on('end', onEnd)

  return sim
}
