// src/constants.js

export const constants = {
  binVendorMagic: "IEDON.NET",
  render: {
    pixelRatio: window.devicePixelRatio || 1,
    d3force: {
      linkDistance: 100,
      manyBodyStrength: -500,
      alphaDecay: 0.05,
    },
    canvas: {
      initialScale: 1.45,
      backgroundColor: "#333",
    },
    node: {
      minSize: 3,
      maxSize: 15,
      scaleSqrtDomain: [1500, 10000],
      scaleSqrtRange: [1, 15],
      colorDefault: "orange",
      colorCurrent: "red",
      colorLinked: "#667dfd",
      labelColor: "#fff",
      labelFontSizePx: 6,
      labelFontFamily: "Inter, sans-serif",
    },
    link: {
      colorDefault: "#1d5232",
      colorEmphasize: "#ce8815",
      widthDefault: 0.5,
      widthEmphasize: 1,
    },
  },
  dn42: {
    accessingFromDn42: window.location.href.includes(".dn42"),
    whoisApi: window.location.href.includes(".dn42")
      ? "https://map.dn42/asn/"
      : "https://api.iedon.com/dn42/asn/",
    explorerUrl: window.location.href.includes(".dn42")
      ? "http://explorer.burble.dn42/?#/"
      : "https://explorer.burble.com/?#/",
    homeUrl: window.location.href.includes(".dn42")
      ? "https://wiki.dn42/"
      : "https://dn42.dev/",
    routeGraphsUrl: window.location.href.includes(".dn42")
      ? "https://routegraphs.highdef.dn42/"
      : "https://routegraphs.highdef.network/",
    peerFinderUrl: "https://dn42.us/peers/",
    myIpUrl: `${location.protocol}//map.dn42/myip/`,
    myIpApi: `${location.protocol}//map.dn42/myip/api`,
    // rawJsonApiUrl: window.location.href.includes(".dn42")
    //   ? "https://map.dn42/map?type=json"
    //   : "https://api.iedon.com/dn42/map?type=json",
    rawJsonApiUrl: window.location.href.includes(".dn42")
         ? "https://wiki.dn42/internal/Internal-Services#map-dn42-api-services"
         : "https://wiki.dn42.dev/internal/Internal-Services#map-dn42-api-services",
    queryRoutesUrl: window.location.href.includes(".dn42")
      ? "https://lg.iedon.dn42/route_all/us-lax+us-sjc+jp-tyo+jp-kot+jp-118+de-fra+hk-hkg+cn-czx+cn-ntg+sg-sin/"
      : "https://lg.iedon.net/route_all/us-lax+us-sjc+jp-tyo+jp-kot+jp-118+de-fra+hk-hkg+cn-czx+cn-ntg+sg-sin/",
    routeGraphInitiateAsn: 4242422189,
    toolboxUrl: "https://dn42.g-load.eu/toolbox/"
  },
};
