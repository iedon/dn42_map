// src/utils/ipUtil.js

/**
 * Compresses an IPv6 address string to its canonical form.
 *
 * @param {string} ip - An IPv6 address in full form (e.g. "fd42:4242:2189:0:0:0:0:0").
 * @returns {string} The compressed IPv6 address (e.g. "fd42:4242:2189::").
 */
function compressIPv6(ip) {
  // Split the IPv6 address into segments.
  let segments = ip.split(':');

  // Remove leading zeros from each segment.
  segments = segments.map(seg => {
    // Remove leading zeros; if the segment becomes empty, return "0".
    return seg.replace(/^0+/, '') || '0';
  });

  // Find the longest run of consecutive "0" segments.
  let bestStart = -1,
    bestLen = 0;
  let curStart = -1,
    curLen = 0;
  segments.forEach((seg, i) => {
    if (seg === '0') {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen++;
      }
    } else {
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
      curStart = -1;
      curLen = 0;
    }
  });
  // Check at the end in case the best sequence is at the end.
  if (curLen > bestLen) {
    bestStart = curStart;
    bestLen = curLen;
  }

  // If there is no sequence of two or more consecutive zeros, return the joined segments.
  if (bestLen < 2) {
    return segments.join(':');
  }

  // Build the compressed address:
  // - The part before the zero sequence.
  // - A double colon in place of the zero sequence.
  // - The part after the zero sequence.
  const left = segments.slice(0, bestStart);
  const right = segments.slice(bestStart + bestLen);
  let compressed = '';

  if (left.length > 0) {
    compressed += left.join(':');
  }
  compressed += '::';
  if (right.length > 0) {
    compressed += right.join(':');
  }

  return compressed;
}

/**
 * Reconstructs an IPv6 address from four 32-bit parts:
 *   high_h32 and high_l32 form the high 64 bits,
 *   low_h32 and low_l32 form the low 64 bits.
 * @param {number|string|bigint} high_h32 - Upper 32 bits of the high portion.
 * @param {number|string|bigint} high_l32 - Lower 32 bits of the high portion.
 * @param {number|string|bigint} low_h32  - Upper 32 bits of the low portion.
 * @param {number|string|bigint} low_l32  - Lower 32 bits of the low portion.
 * @returns {string} The full IPv6 address in expanded colon-delimited notation.
 */
export function ipv6FromQuard32(high_h32, high_l32, low_h32, low_l32) {
  // Ensure all parts are handled as BigInts.
  high_h32 = BigInt(high_h32 || 0);
  high_l32 = BigInt(high_l32 || 0);
  low_h32 = BigInt(low_h32 || 0);
  low_l32 = BigInt(low_l32 || 0);

  // Combine the two 32-bit parts into a 64-bit value for the high and low portions.
  const high64 = (high_h32 << 32n) | high_l32;
  const low64 = (low_h32 << 32n) | low_l32;

  // Combine the high64 and low64 into the full 128-bit IPv6 address.
  const ip128 = (high64 << 64n) | low64;

  // Create an array to hold the eight 16-bit groups.
  const groups = [];
  // There are 8 groups of 16 bits each in a 128-bit IPv6 address.
  for (let i = 0; i < 8; i++) {
    // Calculate the shift amount to extract the corresponding group.
    const shift = 112n - 16n * BigInt(i);
    // Extract the current 16-bit group.
    const group = (ip128 >> shift) & 0xFFFFn;
    // Convert the group to a hexadecimal string and pad it to 4 digits.
    groups.push(group.toString(16).padStart(4, '0'));
  }
  // Join the groups with colons to form the final IPv6 address.
  const rawIPv6 = groups.join(':');
  return compressIPv6(rawIPv6);
}

export const ipv4FromUint32 = ipv4 => [(ipv4 >> 24) & 0xff, (ipv4 >> 16) & 0xff, (ipv4 >> 8) & 0xff, ipv4 & 0xff].join(".");
