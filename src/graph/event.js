// src/graph/event.js

import { constants } from "../constants";
import {
  showTooltip,
  hideTooltip,
  navigateToNode,
  showSidebar,
  closeSideBar,
  getShowingSideBar,
  checkSearchInputEventListener,
  closeSideBarEventListener,
  searchNodeEventListener,
} from "./sidebar";
import { forceCenter } from "d3-force";
import { select } from "d3-selection";

let map, focusingNode, draggingNode, showingTooltip, pointerIsDown;
export function initEvent(_map) {
  map = _map;

  map.canvas.addEventListener("pointermove", pointerMove);
  map.canvas.addEventListener("pointerleave", pointerLeave);
  map.canvas.addEventListener("pointerdown", pointerDown);
  map.canvas.addEventListener("pointerup", pointerUp);
  map.canvas.addEventListener("contextmenu", (e) => {
    // Right click
    if (e.button === 2) clearSelection();
    // all other click will also be disabled
    e.preventDefault();
    return false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearSelection();
      e.preventDefault();
      return false;
    }
  });
  resizeEventListener();
  checkSearchInputEventListener();
  closeSideBarEventListener();
  searchNodeEventListener();
  hashChangeEventListener();
  enableZoom();
}

// Clear selection and close sidebar
function clearSelection() {
  if (!map) return;
  closeSideBar();
  map.hoveredNode = null;
  map.draw();
  // Clear URL hash when clearing selection
  if (window.location.hash) {
    window.history.pushState(
      "",
      document.title,
      window.location.pathname + window.location.search
    );
  }
  document.title = constants.pageTitle;
}

// Register zoom after other canvas events, and disable default double click event
function enableZoom() {
  select(map.canvas).call(map.zoom).on("dblclick.zoom", null);
}

function disableZoom() {
  select(map.canvas).on(".zoom", null);
}

// Resize Handling (HiDPI Aware)
function resizeEventListener() {
  window.addEventListener("resize", () => {
    map.canvas.width = window.innerWidth * constants.render.pixelRatio;
    map.canvas.height = window.innerHeight * constants.render.pixelRatio;
    map.canvas.style.width = `${window.innerWidth}px`;
    map.canvas.style.height = `${window.innerHeight}px`;

    map.ctx.scale(constants.render.pixelRatio, constants.render.pixelRatio);
    map.simulation.force(
      "center",
      forceCenter(window.innerWidth / 2, window.innerHeight / 2)
    );
    map.simulation.alpha(0.5).restart();
  });
}

function getCoordination(container, event) {
  const rect = container.getBoundingClientRect(),
    scrollLeft = window.scrollX || document.documentElement.scrollLeft,
    scrollTop = window.scrollY || document.documentElement.scrollTop;

  return map.transform.invert([
    event.pageX - (rect.left + scrollLeft),
    event.pageY - (rect.top + scrollTop),
  ]);
}

function pointerMove(event) {
  const [x, y] = getCoordination(map.canvas, event);

  if (focusingNode) {
    // Start dragging
    draggingNode = focusingNode;
    // Temporarily Disable Zoom While Dragging
    disableZoom();
    map.simulation.alphaTarget(0.3).restart();
    focusingNode = null;
  }

  // Handle dragging
  if (draggingNode) {
    if (showingTooltip) {
      hideTooltip();
      showingTooltip = false;
    }
    draggingNode.fx = x;
    draggingNode.fy = y;
    map.draw(); // Redraw for smooth dragging
    return;
  }

  if (!pointerIsDown) {
    const hoveredNode = findClosestNode(x, y);
    // Change cursor to pointer if hovering a node
    map.canvas.style.cursor = hoveredNode ? "pointer" : "grab";
    if (hoveredNode) {
      if (!getShowingSideBar()) {
        map.hoveredNode = hoveredNode;
        map.draw();
      }
      showTooltip(event, hoveredNode);
      showingTooltip = true;
    } else {
      hideTooltip();
      showingTooltip = false;
    }
  } else {
    map.canvas.style.cursor = "grabbing";
  }
}

function pointerDown(event) {
  pointerIsDown = true;
  const [x, y] = getCoordination(map.canvas, event);

  focusingNode = findClosestNode(x, y);
  if (focusingNode) {
    disableZoom();
  } else {
    map.canvas.style.cursor = "grabbing";
  }
}

function pointerLeave() {
  pointerIsDown = false;
  focusingNode = null;
  stopDragging();
}

function pointerUp(event) {
  pointerIsDown = false;
  if (focusingNode) {
    // This is a click to a node, not dragging
    const [x, y] = getCoordination(map.canvas, event);

    map.hoveredNode = findClosestNode(x, y);
    if (map.hoveredNode) {
      navigateToNode(map.hoveredNode);
      showSidebar(map.hoveredNode);
    }

    focusingNode = null;
    // Not dragging, revert to enable zoom
    enableZoom();
    return;
  }

  map.canvas.style.cursor = "grab";
  stopDragging();
}

function stopDragging() {
  if (draggingNode) {
    draggingNode.fx = null; // Release fixed position
    draggingNode.fy = null;
    map.simulation.alphaTarget(0); // Resume normal physics
    draggingNode = null;
    focusingNode = null;

    // Re-enable Zoom After Dragging Ends
    enableZoom();
  }
}

// Find Closest Node
function findClosestNode(x, y) {
  let minDist = Infinity;
  let closestNode = null;
  const coverage = 15;

  map.nodes.forEach((node) => {
    // Calculate distance between the mouse position
    const dist = Math.hypot(node.x - x, node.y - y);

    // Scale selection tolerance based on zoom level
    if (dist < coverage && dist < minDist) {
      minDist = dist;
      closestNode = node;
    }
  });

  return closestNode;
}

// Hash-based navigation support
function hashChangeEventListener() {
  window.addEventListener("hashchange", handleHashChange);

  // Check for initial hash on page load
  if (window.location.hash) {
    // Delay hash handling until simulation has settled
    map.simulation.on("end", () => {
      handleHashChange();
    });
  }
}

function handleHashChange() {
  const hash = window.location.hash.slice(1); // Remove the # character
  if (hash && map.nodeMap) {
    searchNodeByHash(hash);
  }
}

function searchNodeByHash(hash) {
  if (!hash.length) return;

  const query = hash.toLowerCase();
  let node = map.nodeMap.get(query);

  if (node) {
    navigateToNode(node);
    showSidebar(node);
    return;
  }

  // DN42 trick: auto add 424242 if searching by partial ASN (e.g., "2190" -> "4242422190")
  if (!hash.startsWith("424242")) {
    const asn = `424242${query}`;
    node = map.nodeMap.get(asn);
    if (node) {
      navigateToNode(node);
      showSidebar(node);
      return;
    }
  }

  clearSelection();
}
