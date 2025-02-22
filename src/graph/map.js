// src/graph/map.js

import { constants } from "../constants";
import { ipv4FromUint32, ipv6FromQuard32 } from "../utils/ipUtil"
import { scaleSqrt } from "../utils/scaleUtil";
import { initSidebar } from "./sidebar";
import { initEvent } from "./event";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { forceSimulation, forceCenter, forceLink, forceManyBody } from "d3-force";

// Precompute colors and widths
const linkColorDefault = constants.render.link.colorDefault;
const linkWidthDefault = constants.render.link.widthDefault;
const linkColorEmphasize = constants.render.link.colorEmphasize;
const linkWidthEmphasize = constants.render.link.widthEmphasize;
const nodeColorCurrent = constants.render.node.colorCurrent;
const nodeColorLinked = constants.render.node.colorLinked;
const nodeColorDefault = constants.render.node.colorDefault;
const nodeLabelColor = constants.render.node.labelColor;

const map = {
  canvas: null,
  ctx: null,
  draw: null,
  simulation: null,
  nodes: null,
  nodeMap: new Map(),
  links: null,
  zoom: null,
  hoveredNode: null,
  transform: zoomIdentity,
};

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

  // Zoom & Pan
  map.zoom = d3zoom()
  .scaleExtent([0.3, 4])
  .on("zoom", (event) => {
      map.transform = event.transform;
      map.draw();
  });
}

function initScale() {
  // Set initial scale
  select(map.canvas).call(map.zoom.transform, zoomIdentity.scale(constants.render.canvas.initialScale));
}

function preprocessDataset(data) {
  map.nodes = structuredClone(data.nodes);
  map.links = structuredClone(data.links);

  // Convert links to use actual node object references
  map.links.forEach(link => {
    link.source = map.nodes[link.source ?? 0];
    link.target = map.nodes[link.target ?? 0];
  });

  // Setup peers and fast lookup map for nodes
  map.nodes.forEach(node => {
    node.peers = new Set();
    map.nodeMap.set(node.asn.toString(), node);
    map.nodeMap.set(node.desc.toLowerCase(), node);

    node.label = node.desc
      .replace("-DN42", "")
      .replace("-MNT", "")
      .replace("-AS", "")
      .replace("-NEONETWORK", "")
      .replace("ICVPN-", "")
      .replace("-CRXN", "");

    node.labelFontSizeCalculated = scaleSqrt(
      [0, 12],
      [constants.render.node.labelFontSizePx / 4, constants.render.node.labelFontSizePx],
      12 - node.label.length * 0.5
    );

    node.labelFontFamilyNormal = `${node.labelFontSizeCalculated}px ${constants.render.node.labelFontFamily}`;
    node.labelFontFamilyBold = `bold ${node.labelFontFamilyNormal}`;

    const parsed = [];
    node.routes?.forEach(route => {
      const length = route.length;
      // Check the oneof fields: either "ipv4" or "ipv6" is set.
      if (route.ipv4 != null) {
        // route.ipv4 is a 32-bit number; convert it to dotted-quad notation.
        const ipStr = ipv4FromUint32(route.ipv4);
        parsed.push(`${ipStr}/${length}`);
      } else if (route.ipv6 != null) {
        const ipStr = ipv6FromQuard32(route.ipv6.high_h32, route.ipv6.high_l32, route.ipv6.low_h32, route.ipv6.low_l32);
        parsed.push(`${ipStr}/${length}`);
      } else {
        console.warn(`[preprocess] Unknown or empty IP route for AS${node.asn}, skipped.`);
      }
    });
    node.routes = parsed;
  });

  map.links.forEach(link => {
    if (link.source && link.target) {
      link.source.peers.add(link.target.asn);
      link.target.peers.add(link.source.asn);
    }
  });

  // Scale node sizes based on peer count
  const maxPeers = Math.max(...map.nodes.map(n => n.peers.size), 1);
  map.nodes.forEach(node => {
    node.size = scaleSqrt([0, maxPeers], constants.render.node.scaleSqrtRange, node.peers.size);
  });
}

function initSimulation() {
  // Force Simulation
  map.simulation = forceSimulation(map.nodes)
    .force("link", forceLink(map.links).id(d => d.asn).distance(constants.render.d3force.linkDistance))
    .force("charge", forceManyBody().strength(constants.render.d3force.manyBodyStrength))
    .force("center", forceCenter(window.innerWidth / 2, window.innerHeight / 2))
    .alphaDecay(constants.render.d3force.alphaDecay)
    .on("tick", map.draw);
  map.draw();
}

// Draw Function (HiDPI aware)
map.draw = () => {
  const { canvas, ctx, transform, links, nodes, hoveredNode } = map;

  // Clean canvas with background image
  ctx.fillStyle = constants.render.canvas.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  // Draw all links in one loop
  links.forEach(d => {
      if (!hoveredNode || (d.source !== hoveredNode && d.target !== hoveredNode)) {
          ctx.beginPath();
          ctx.moveTo(d.source.x, d.source.y);
          ctx.lineTo(d.target.x, d.target.y);
          ctx.strokeStyle = linkColorDefault;
          ctx.lineWidth = linkWidthDefault;
          ctx.stroke();
      }
  });

  // Draw emphasized links separately
  if (hoveredNode) {
      links.forEach(d => {
          if (d.source === hoveredNode || d.target === hoveredNode) {
              ctx.beginPath();
              ctx.moveTo(d.source.x, d.source.y);
              ctx.lineTo(d.target.x, d.target.y);
              ctx.strokeStyle = linkColorEmphasize;
              ctx.lineWidth = linkWidthEmphasize;
              ctx.stroke();
          }
      });
  }

  const zoomSufficient = transform.k >= 0.65;

  // Draw nodes
  nodes.forEach(d => {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);

      if (d === hoveredNode) {
          ctx.fillStyle = nodeColorCurrent;
      } else if (hoveredNode && hoveredNode.peers.has(d.asn)) {
          ctx.fillStyle = nodeColorLinked;
      } else {
          ctx.fillStyle = nodeColorDefault;
      }

      ctx.fill();

      // draw border 0.5px, removed due to switched to dark theme
      // ctx.strokeStyle = "#fff";
      // ctx.lineWidth = 0.5;
      // ctx.stroke();

      // Draw labels only if zoom level is sufficient
      if (zoomSufficient) {
          ctx.font = d === hoveredNode ? d.labelFontFamilyBold : d.labelFontFamilyNormal;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = nodeLabelColor;
          ctx.fillText(d.label, d.x, d.y + d.size + d.labelFontSizeCalculated / 2 + 1);
      }
  });

  ctx.restore();
};

/**
 * Initializes the map with given data and container ID.
 */
export function initMap(data, containerSelector) {
  initCanvas(containerSelector);
  preprocessDataset(data);
  initSimulation();
  initScale();
  initSidebar(map);
  initEvent(map);
}
