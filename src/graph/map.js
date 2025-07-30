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

    const parsed = [];
    node.routes?.forEach((route) => {
      const length = route.length;
      // Check the oneof fields: either "ipv4" or "ipv6" is set.
      if (route.ipv4 != null) {
        // route.ipv4 is a 32-bit number; convert it to dotted-quad notation.
        const ipStr = ipv4FromUint32(route.ipv4);
        parsed.push(`${ipStr}/${length}`);
      } else if (route.ipv6 != null) {
        const ipStr = ipv6FromQuard32(
          route.ipv6.high_h32,
          route.ipv6.high_l32,
          route.ipv6.low_h32,
          route.ipv6.low_l32
        );
        parsed.push(`${ipStr}/${length}`);
      } else {
        console.warn(
          `[preprocess] Unknown or empty IP route for AS${node.asn}, skipped.`
        );
      }
    });
    node.routes = parsed;

    node.centrality.index = node.centrality.index || 0;
    node.centrality.degree = node.centrality.degree || 0;
    node.centrality.betweenness = node.centrality.betweenness || 0.0;
    node.centrality.closeness = node.centrality.closeness || 0.0;
  });

  // Convert links to use actual node object references and deduplicate
  let deduplicatedLinks = links;
  if (!isDump) {
    const seenLinks = new Set();
    deduplicatedLinks = [];

    links.forEach((link) => {
      link.source = nodes[link.source ?? 0];
      link.target = nodes[link.target ?? 0];
      if (!link.source.peers) link.source.peers = new Set();
      if (!link.target.peers) link.target.peers = new Set();
      link.source.peers.add(link.target.asn);
      link.target.peers.add(link.source.asn);
      linkMap.set(`${link.source.asn}_${link.target.asn}`, true);

      // Deduplicate for rendering
      const sourceAsn = link.source.asn;
      const targetAsn = link.target.asn;
      const linkKey =
        sourceAsn < targetAsn
          ? `${sourceAsn}-${targetAsn}`
          : `${targetAsn}-${sourceAsn}`;

      if (!seenLinks.has(linkKey)) {
        seenLinks.add(linkKey);
        deduplicatedLinks.push(link);
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
