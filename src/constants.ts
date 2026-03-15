import { AF_FILTERS, type AfFilter } from '@/types'

const isDn42 = location.href.includes('.dn42')

export const BIN_VENDOR_MAGIC = 'IEDON.NET'
export const MAP_VERSION = 2

/** Timing constants for throttle, debounce, and animations */
export const TIMING = {
  pointerThrottleMs: 13,
  resizeDebounceMs: 150,
  searchDebounceMs: 200,
  loadingFadeMs: 500,
  navigateAnimationMs: 500,
} as const

/** Rendering and simulation configuration */
export const RENDER = {
  pixelRatio: window.devicePixelRatio || 1,

  d3force: {
    linkDistance: 100,
    manyBodyStrength: -500,
    alphaDecay: 0.05,
    filterRatioMin: 0.6,
    /** Alpha threshold below which the simulation is considered settled */
    settleAlpha: 0.02,
    /** Alpha target during node drag (scaled by filterRatio) */
    dragAlphaTarget: 0.1,
    /** Alpha to reheat simulation on window resize */
    resizeReheatAlpha: 0.5,
  },

  canvas: {
    zoom: {
      min: 0.3,
      max: 4,
      initial: 1.45,
    },
    backgroundColor: '#333',
    accentColor: '#ce8815',
    viewportMargin: 0,
  },

  tooltip: {
    /** Pixel offset from cursor to tooltip position */
    offsetPx: 10,
  },

  loading: {
    /** Percentage at or above which to snap to 100% */
    snapThreshold: 98,
  },

  node: {
    minSize: 3,
    maxSize: 16,
    scaleSqrtDomain: [1500, 10000] as [number, number],
    scaleSqrtRange: [1, 16] as [number, number],
    colorDefault: 'orange',
    colorCurrent: 'red',
    colorLinked: '#667dfd',
    borderColor: '#fff',
    borderWidth: 0.5,
    labelColor: '#fff',
    labelFontSizePx: 7,
    labelFontSizeMaxPx: 14,
    labelFontFamily: '-apple-system,Roboto,Noto,"Segoe UI",Arial,sans-serif',
    /** Vertical gap (px) between node circle bottom and label text */
    labelGapPx: 4,
    labelCulling: {
      baseZoomThreshold: 0.65,
      highZoomThreshold: 2.0,
      maxLabelsInView: 80,
      importanceThresholdRange: [500, 50] as [number, number],
    },
    maxFPS: 65,
  },

  link: {
    colorDefault: '#1d5232',
    colorEmphasize: '#ce8815',
    widthDefault: 0.5,
    widthEmphasize: 1,
  },
} as const

/** DN42 network-specific URLs and configuration */
export const DN42 = {
  accessingFromDn42: isDn42,
  /** Common ASN prefix for DN42 autonomous systems */
  baseAsnPrefix: '424242',
  whoisApi: isDn42 ? 'https://map.dn42/asn/' : 'https://api.iedon.com/dn42/asn/',
  explorerUrl: isDn42 ? 'http://explorer.burble.dn42/?#/' : 'https://explorer.burble.com/?#/',
  homeUrl: isDn42 ? 'https://wiki.dn42/' : 'https://dn42.jp/',
  routeGraphsUrl: isDn42 ? 'http://routegraphs.highdef.dn42/' : 'https://routegraphs.highdef.network/',
  peerFinderUrl: 'https://peerfinder.dn42.dev/',
  myIpUrl: `${location.protocol}//map.dn42/myip/`,
  myIpApi: `${location.protocol}//map.dn42/myip/api`,
  rawJsonApiUrl: 'https://iedon.net/post/4',
  queryRoutesUrl: isDn42
    ? 'https://lg.iedon.dn42/route_all/us-lax+us-sjc+jp-tyo+jp-kot+jp-118+de-fra+hk-hkg+cn-czx+cn-ntg+sg-sin+au-syd/'
    : 'https://lg.iedon.net/route_all/us-lax+us-sjc+jp-tyo+jp-kot+jp-118+de-fra+hk-hkg+cn-czx+cn-ntg+sg-sin+au-syd/',
  routeGraphInitiateAsn: 4242422189,
  toolboxUrl: 'https://dn42.g-load.eu/toolbox/',
  timeMachineBinUrlPrefix: 'https://mrt.iedon.net/map',
} as const

// -- Address Family filter display data --

export const AF_OPTIONS: AfFilter[] = [
  AF_FILTERS.ALL,
  AF_FILTERS.AF_ALL_UCAST,
  AF_FILTERS.AF_ALL_MCAST,
  AF_FILTERS.AF_UCAST_IPV4,
  AF_FILTERS.AF_UCAST_IPV6,
  AF_FILTERS.AF_MCAST_IPV4,
  AF_FILTERS.AF_MCAST_IPV6,
]

/** i18n keys for AF filter short labels */
export const AF_LABEL_KEYS: Record<number, string> = {
  [AF_FILTERS.ALL]: 'af.all',
  [AF_FILTERS.AF_ALL_UCAST]: 'af.allUcast',
  [AF_FILTERS.AF_ALL_MCAST]: 'af.allMcast',
  [AF_FILTERS.AF_UCAST_IPV4]: 'af.ucastIpv4',
  [AF_FILTERS.AF_UCAST_IPV6]: 'af.ucastIpv6',
  [AF_FILTERS.AF_MCAST_IPV4]: 'af.mcastIpv4',
  [AF_FILTERS.AF_MCAST_IPV6]: 'af.mcastIpv6',
}

/** i18n keys for AF filter tooltip descriptions */
export const AF_TOOLTIP_KEYS: Record<number, string> = {
  [AF_FILTERS.ALL]: 'af.tooltipAll',
  [AF_FILTERS.AF_ALL_UCAST]: 'af.tooltipAllUcast',
  [AF_FILTERS.AF_ALL_MCAST]: 'af.tooltipAllMcast',
  [AF_FILTERS.AF_UCAST_IPV4]: 'af.tooltipUcastIpv4',
  [AF_FILTERS.AF_UCAST_IPV6]: 'af.tooltipUcastIpv6',
  [AF_FILTERS.AF_MCAST_IPV4]: 'af.tooltipMcastIpv4',
  [AF_FILTERS.AF_MCAST_IPV6]: 'af.tooltipMcastIpv6',
}
