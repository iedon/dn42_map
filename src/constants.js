// src/constants.js

export const constants = {
  binVendorMagic: "IEDON.NET",
  render: {
    pixelRatio: window.devicePixelRatio || 1,
    d3force: {
      linkDistance: 100,
      manyBodyStrength: -500,
      alphaDecay: 0.05
    },
    canvas: {
      initialScale: 1.45,
      backgroundColor: "#f0f0f0",
    },
    node: {
      scaleSqrtRange: [3, 15],
      colorDefault: "mediumaquamarine",
      colorCurrent: "orangered",
      colorLinked: "orange",
      labelColor: "#333",
      labelFontSizePx: 6,
      labelFontFamily: "Inter, sans-serif",
    },
    link: {
      colorDefault: "#ffe5cc",
      colorEmphasize: "lightpink",
      widthDefault: 1,
      widthEmphasize: 2,
    },
  },
  dn42: {
    accessingFromDn42: window.location.href.includes(".dn42"),
    whoisApi: "https://api.iedon.com/dn42/whois",
    explorerUrl:
      window.location.href.includes(".dn42")
        ? "http://explorer.burble.dn42/?#/"
        : "https://explorer.burble.com/?#/",
    homeUrl:
      window.location.href.includes(".dn42")
        ? "https://wiki.dn42/"
        : "https://dn42.dev/",
    peerFinderUrl: "https://dn42.us/peers/",
    myIpUrl: `${location.protocol}//map.dn42/myip/`,
    myIpApi: `${location.protocol}//map.dn42/myip/api`
  },
};
