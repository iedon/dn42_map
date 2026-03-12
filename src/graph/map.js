// src/graph/map.js

import { constants } from "../constants";
import { ipv4FromUint32, ipv6FromQuard32 } from "../utils/ipUtil";
import { scaleSqrt } from "../utils/scaleUtil";
import { initSidebar } from "./sidebar/index.js";
import { initEvent } from "./event";
import { mapDrawer } from "./drawer";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import {
  forceSimulation,
  forceCenter,
  forceLink,
  forceManyBody,
} from "d3-force";

const map = {
  rawData: null,
  canvas: null,
  ctx: null,
  draw: null,
  simulation: null,
  nodes: null,
  nodeMap: null,
  linkMap: null,
  links: null,
  deduplicatedLinks: null,
  zoom: null,
  hoveredNode: null,
  transform: zoomIdentity,
  afFilter: 0, // 0=all, 1=IPv4 only, 2=IPv6 only
  visibleNodeAsns: null, // Cached Set of visible node ASNs for current AF filter
};

let isFirstTimeLoading,
  isFirstTimeLoaded = true;
let updateLoadingPercentageCb = null;
let finishLoadingCb = null;

function initCanvas(containerSelector) {
  // Detect HiDPI & Scale Canvas
  map.canvas = document.querySelector(containerSelector);
  map.ctx = map.canvas.getContext("2d");

  // Set up HiDPI Scaling
  map.canvas.width = window.innerWidth * constants.render.pixelRatio;
  map.canvas.height = window.innerHeight * constants.render.pixelRatio;
  map.canvas.style.width = `${window.innerWidth}px`;
  map.canvas.style.height = `${window.innerHeight}px`;
  map.ctx.scale(constants.render.pixelRatio, constants.render.pixelRatio);

  // Map Drawer
  map.draw = () => {
    // Don't draw nodes and links if still loading (prevents seeing nodes flying around)
    if (isFirstTimeLoading) {
      return;
    }
    mapDrawer(map);
  };

  // Set Zoom & Pan support
  map.zoom = d3zoom()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => {
      map.transform = event.transform;
      map.draw();
    });
}

function setInitialScale() {
  // Calculate center of mass of all nodes
  let centerX = 0;
  let centerY = 0;

  if (map.nodes && map.nodes.length > 0) {
    map.nodes.forEach((node) => {
      centerX += node.x || 0;
      centerY += node.y || 0;
    });
    centerX /= map.nodes.length;
    centerY /= map.nodes.length;
  } else {
    // Fallback to canvas center if no nodes
    centerX = window.innerWidth / 2;
    centerY = window.innerHeight / 2;
  }

  // Calculate the transform to center the nodes and apply initial scale
  const canvasCenterX = window.innerWidth / 2;
  const canvasCenterY = window.innerHeight / 2;
  const initialScale = constants.render.canvas.initialScale;

  const translateX = canvasCenterX - centerX * initialScale;
  const translateY = canvasCenterY - centerY * initialScale;

  // Set initial scale and translation
  select(map.canvas).call(
    map.zoom.transform,
    zoomIdentity.translate(translateX, translateY).scale(initialScale)
  );
}

function preprocessDataset(data, isDump = false) {
  const nodes = structuredClone(data.nodes);
  const links = structuredClone(data.links);
  const nodeMap = new Map();
  const linkMap = new Map();

  // Setup peers and fast lookup map for nodes
  nodes.forEach((node) => {
    // If ASN is missing or zero, set to default 0
    node.asn = node.asn || 0;

    node.label = node.desc
      .replace("-DN42", "")
      .replace("-MNT", "")
      .replace("-AS", "")
      .replace("-NEONETWORK", "")
      .replace("ICVPN-", "")
      .replace("-CRXN", "");

    if (!isDump) {
      nodeMap.set(node.asn.toString(), node);
      nodeMap.set(node.label.toLowerCase(), node);
    }

    if (!isDump)
      node.labelFontSizeCalculated = scaleSqrt(
        [0, constants.render.node.labelFontSizeMaxPx],
        [
          constants.render.node.labelFontSizePx / 4,
          constants.render.node.labelFontSizePx,
        ],
        constants.render.node.labelFontSizeMaxPx - node.label.length * 0.5
      );

    if (!isDump)
      node.labelFontFamilyNormal = `${node.labelFontSizeCalculated}px ${constants.render.node.labelFontFamily}`;
    if (!isDump)
      node.labelFontFamilyBold = `bold ${node.labelFontFamilyNormal}`;

    if (!node.routes?.length) {
      node.routes = [];
    } else {
      // Pre-allocate arrays with estimated capacity
      const ipv4Routes = [];
      const ipv6Routes = [];

      // Parse and categorize routes
      for (let i = 0; i < node.routes.length; i++) {
        const route = node.routes[i];
        const length = route.length;

        if (route.ipv4 != null) {
          const ipStr = ipv4FromUint32(route.ipv4);
          ipv4Routes.push([length, `${ipStr}/${length}`]);
        } else if (route.ipv6 != null) {
          const ipStr = ipv6FromQuard32(
            route.ipv6.high_h32,
            route.ipv6.high_l32,
            route.ipv6.low_h32,
            route.ipv6.low_l32
          );
          ipv6Routes.push([length, `${ipStr}/${length}`]);
        } else {
          console.warn(
            `[preprocess] Unknown or empty IP route for AS${node.asn}, skipped.`
          );
        }
      }

      // Sort by length (first element of tuple)
      ipv4Routes.sort((a, b) => a[0] - b[0]);
      ipv6Routes.sort((a, b) => a[0] - b[0]);

      // Build final array directly without intermediate mapping
      const totalLength = ipv4Routes.length + ipv6Routes.length;
      node.routes = new Array(totalLength);
      let idx = 0;

      // Copy IPv4 routes
      for (let i = 0; i < ipv4Routes.length; i++) {
        node.routes[idx++] = ipv4Routes[i][1];
      }

      // Copy IPv6 routes
      for (let i = 0; i < ipv6Routes.length; i++) {
        node.routes[idx++] = ipv6Routes[i][1];
      }
    }

    node.centrality.index = node.centrality.index || 0;
    node.centrality.degree = node.centrality.degree || 0;
    node.centrality.betweenness = node.centrality.betweenness || 0.0;
    node.centrality.closeness = node.centrality.closeness || 0.0;
  });

  // Convert links to use actual node object references and deduplicate
  let deduplicatedLinks = links;
  if (!isDump) {
    const seenLinks = new Map();
    deduplicatedLinks = [];

    links.forEach((link) => {
      link.source = nodes[link.source ?? 0];
      link.target = nodes[link.target ?? 0];
      if (!link.source.peers) link.source.peers = new Set();
      if (!link.target.peers) link.target.peers = new Set();
      link.source.peers.add(link.target.asn);
      link.target.peers.add(link.source.asn);
      linkMap.set(`${link.source.asn}_${link.target.asn}`, true);

      // Deduplicate for rendering, OR address family bits
      const sourceAsn = link.source.asn;
      const targetAsn = link.target.asn;
      const linkKey =
        sourceAsn < targetAsn
          ? `${sourceAsn}-${targetAsn}`
          : `${targetAsn}-${sourceAsn}`;

      if (!seenLinks.has(linkKey)) {
        // First time seeing this link, add to deduplicated list
        seenLinks.set(linkKey, link);
        deduplicatedLinks.push(link);
      } else {
        // If link already seen, update AF bitmask to include this link's AF
        seenLinks.get(linkKey).af = (seenLinks.get(linkKey).af || 0) | (link.af || 0);
      }
    });
  }

  // Scale node sizes based on peer count
  if (!isDump) {
    nodes.forEach((node) => {
      node.size =
        scaleSqrt(
          constants.render.node.scaleSqrtDomain,
          constants.render.node.scaleSqrtRange,
          node.centrality.index
        ) || constants.render.node.minSize;
      node.size = Math.max(constants.render.node.minSize, node.size);
      node.size = Math.min(constants.render.node.maxSize, node.size);
    });
  }

  return {
    nodes,
    links,
    deduplicatedLinks,
    nodeMap,
    linkMap,
  };
}

function initSimulation() {
  // Force Simulation
  map.simulation = forceSimulation(map.nodes)
    .force(
      "link",
      forceLink(map.links)
        .id((d) => d.asn)
        .distance(constants.render.d3force.linkDistance)
    )
    .force(
      "charge",
      forceManyBody().strength(constants.render.d3force.manyBodyStrength)
    )
    .force("center", forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .alphaDecay(constants.render.d3force.alphaDecay)
    .on("tick", map.draw)
    .on("end", () => {
      // Hide loading overlay when simulation stops
      finishLoadingCb();
      isFirstTimeLoading = false;
      if (isFirstTimeLoaded) {
        setInitialScale();
        isFirstTimeLoaded = false;
      }
    });

  // Also hide loading overlay if alpha gets low enough (simulation is mostly settled)
  map.simulation.on("tick", () => {
    map.draw();

    if (isFirstTimeLoading) {
      const alpha = map.simulation.alpha();
      updateLoadingPercentageCb(alpha);
      if (alpha < 0.02) {
        // early close loading overlay
        finishLoadingCb();
        isFirstTimeLoading = false;
        if (isFirstTimeLoaded) {
          setInitialScale();
          isFirstTimeLoaded = false;
        }
      }
    }
  });

  map.draw();
}

// Dump JSON
// window.dumpJson = () => {
//   try {
//     const { nodes, links } = preprocessDataset(map.rawData, true);
//     const jsonString = JSON.stringify({ nodes, links }, null, 2);
//     const blob = new Blob([jsonString], { type: "application/json" });
//     const url = URL.createObjectURL(blob);

//     const link = document.createElement("a");
//     link.style.display = "none";
//     link.href = url;
//     link.download = `map_dn42_${+new Date()}.json`;
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);

//     URL.revokeObjectURL(url);
//   } catch (error) {
//     console.error(error);
//   }
// };

// AF bitmask: 1=IPv4 unicast, 2=IPv6 unicast, 4=IPv4 multicast, 8=IPv6 multicast
const AF_CYCLE = [0, 1, 2, 4, 8];
const AF_BUTTON_HTML = {
  0: "ALL",
  1: "IPv4",
  2: "IPv6",
  4: '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv4</span>',
  8: '<span style="font-size:9px;line-height:1.1">MCAST<br>IPv6</span>',
};
const AF_TOOLTIP = {
  0: "Address Family Filter: All",
  1: "Address Family Filter: IPv4 Unicast",
  2: "Address Family Filter: IPv6 Unicast",
  4: "Address Family Filter: IPv4 Multicast",
  8: "Address Family Filter: IPv6 Multicast",
};

function rebuildVisibleNodeAsns() {
  if (!map.afFilter) {
    map.visibleNodeAsns = null;
    return;
  }
  const visible = new Set();
  for (const link of map.deduplicatedLinks) {
    if (link.af & map.afFilter) {
      visible.add(link.source.asn);
      visible.add(link.target.asn);
    }
  }
  map.visibleNodeAsns = visible;
}

window.cycleAfFilter = () => {
  const currentIdx = AF_CYCLE.indexOf(map.afFilter);
  map.afFilter = AF_CYCLE[(currentIdx + 1) % AF_CYCLE.length];
  rebuildVisibleNodeAsns();
  setInitialScale();
  map.draw();

  const btn = document.querySelector(".toolbar-icon[data-af-filter]");
  if (btn) {
    btn.innerHTML = AF_BUTTON_HTML[map.afFilter];
    btn.setAttribute("data-tooltip", AF_TOOLTIP[map.afFilter]);
    btn.setAttribute("aria-label", AF_TOOLTIP[map.afFilter]);
  }
};

/**
 * Initializes the map with given data and container ID.
 */
export function initMap(
  data,
  containerSelector,
  setLoadingState,
  updateLoadingPercentageCallback,
  finishLoadingCallback
) {
  isFirstTimeLoading = true;
  updateLoadingPercentageCb = updateLoadingPercentageCallback;
  finishLoadingCb = finishLoadingCallback;

  setLoadingState("parsing");

  map.rawData = data;
  initCanvas(containerSelector);
  Object.assign(map, preprocessDataset(data));

  setLoadingState("rendering");

  initSimulation();

  initSidebar(map);
  initEvent(map);
}
