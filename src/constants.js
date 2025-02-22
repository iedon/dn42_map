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
      backgroundColor: "#333",
    },
    node: {
      scaleSqrtRange: [3, 15],
      colorDefault: "orange",
      colorCurrent: "red",
      colorLinked: "#667dfd",
      labelColor: "#fff",
      labelFontSizePx: 6,
      labelFontFamily: "Inter, sans-serif",
    },
    link: {
      colorDefault: "#1c412b",
      colorEmphasize: "#be801a",
      widthDefault: 0.5,
      widthEmphasize: 1,
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
