export function scaleSqrt(
  domain: [number, number],
  range: [number, number],
  value: number,
): number {
  const t = (value - domain[0]) / (domain[1] - domain[0])
  return range[0] + Math.sqrt(t) * (range[1] - range[0])
}
