export function ipv4FromUint32(ipv4: number): string {
  return `${(ipv4 >> 24) & 0xff}.${(ipv4 >> 16) & 0xff}.${(ipv4 >> 8) & 0xff}.${ipv4 & 0xff}`
}

export function ipv6FromQuad32(
  high_h32: number | bigint,
  high_l32: number | bigint,
  low_h32: number | bigint,
  low_l32: number | bigint,
): string {
  const hh = BigInt(high_h32 || 0)
  const hl = BigInt(high_l32 || 0)
  const lh = BigInt(low_h32 || 0)
  const ll = BigInt(low_l32 || 0)

  const ip128 = ((hh << 32n) | hl) << 64n | ((lh << 32n) | ll)

  const groups: string[] = []
  for (let i = 0; i < 8; i++) {
    const shift = 112n - 16n * BigInt(i)
    groups.push(((ip128 >> shift) & 0xFFFFn).toString(16).padStart(4, '0'))
  }

  return compressIPv6(groups.join(':'))
}

function compressIPv6(ip: string): string {
  let segments = ip.split(':').map(s => s.replace(/^0+/, '') || '0')

  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0

  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === '0') {
      if (curStart === -1) { curStart = i; curLen = 1 } else { curLen++ }
    } else {
      if (curLen > bestLen) { bestStart = curStart; bestLen = curLen }
      curStart = -1; curLen = 0
    }
  }
  if (curLen > bestLen) { bestStart = curStart; bestLen = curLen }

  if (bestLen < 2) return segments.join(':')

  const left = segments.slice(0, bestStart)
  const right = segments.slice(bestStart + bestLen)
  return (left.length ? left.join(':') : '') + '::' + (right.length ? right.join(':') : '')
}
