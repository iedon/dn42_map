const isDn42 = location.href.includes('.dn42')

export const PAGE_TITLE = 'DN42 Realtime Network Map'
export const BIN_VENDOR_MAGIC = 'IEDON.NET'
export const MAP_VERSION = 2

export const RENDER = {
  pixelRatio: window.devicePixelRatio || 1,
  d3force: {
    linkDistance: 100,
    manyBodyStrength: -500,
    alphaDecay: 0.05,
  },
  canvas: {
    zoom: {
      min: 0.3,
      max: 4,
      initial: 1.45,
    },
    backgroundColor: '#333',
    // viewportMargin: 100,
    viewportMargin: 0, // Extra margin for smooth viewport culling transitions
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
      labelCulling: {
        baseZoomThreshold: 0.65, // Minimum zoom to start showing any labels
        highZoomThreshold: 2.0, // Zoom level to show all labels in viewport
        maxLabelsInView: 80, // Maximum number of labels to render at once
        importanceThresholdRange: [500, 50] as [number, number], // Importance score range for medium zoom levels
      },
    maxFPS: 75,
  },
  link: {
    colorDefault: '#1d5232',
    colorEmphasize: '#ce8815',
    widthDefault: 0.5,
    widthEmphasize: 1,
  },
} as const

export const DN42 = {
  accessingFromDn42: isDn42,
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
