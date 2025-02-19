// src/utils/scaleUtil.js

/**
 * Performs square root scaling.
 */
export function scaleSqrt(domain, range, value) {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  
  const t = (value - domainMin) / (domainMax - domainMin);
  
  return rangeMin + Math.sqrt(t) * (rangeMax - rangeMin);
}
