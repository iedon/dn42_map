// src/graph/sidebar/navigation.js

import { constants } from "../../constants.js";
import { getMap } from "./sidebarCore.js";
import { showSidebar } from "./sidebarDisplay.js";
import { select } from "d3-selection";
import { zoomIdentity } from "d3-zoom";

// Center the graph on the given node and show details in sidebar
export const navigateToNode = (nodeOrAsn) => {
  const map = getMap();
  const node =
    typeof nodeOrAsn === "number"
      ? map.nodeMap.get(nodeOrAsn.toString())
      : nodeOrAsn;

  if (!node) {
    document.title = constants.pageTitle;
    return;
  }

  map.hoveredNode = node;

  // Update URL hash for direct linking
  if (window.location.hash !== `#${node.asn}`) {
    window.location.hash = node.asn;
  }

  // Center the view on the node with smooth transition
  if (node.x !== undefined && node.y !== undefined) {
    const canvasCenterX = window.innerWidth / 2;
    const canvasCenterY = window.innerHeight / 2;
    const currentScale = map.transform.k;

    const translateX = canvasCenterX - node.x * currentScale;
    const translateY = canvasCenterY - node.y * currentScale;

    // Apply the new transform to center the node with smooth transition
    select(map.canvas)
      .transition()
      .duration(500)
      .call(
        map.zoom.transform,
        zoomIdentity.translate(translateX, translateY).scale(currentScale)
      );
  }

  document.title = `${node.desc} (AS${node.asn}) - ${constants.pageTitle}`;
  map.draw();
};

// Search for a node based on input value
export function searchNode() {
  const map = getMap();
  const value = document.getElementById("search-input").value;
  if (!value.length) return;

  const query = value.toLowerCase();
  const node = map.nodeMap.get(query);

  if (node) {
    navigateToNode(node);
    showSidebar(node);
  } else {
    // DN42 trick: auto add 424242 if searching by "2189"(eg) -> 4242422189
    if (!value.startsWith("424242")) {
      const asn = `424242${query}`;
      const node = map.nodeMap.get(asn);
      if (node) {
        navigateToNode(node);
        showSidebar(node);
        document.getElementById("search-input").value = asn;
      } else {
        alert("Node not found.");
      }
    } else {
      alert("Node not found.");
    }
  }
}

function checkSearchInput(event) {
  if (event.key === "Enter") searchNode();
  return false;
}

// Global functions for window object
window.navigateToNode = (nodeOrAsn, sideBar = false) => {
  const map = getMap();
  const node =
    typeof nodeOrAsn === "number"
      ? map.nodeMap.get(nodeOrAsn.toString())
      : nodeOrAsn;

  if (!node) return;

  navigateToNode(node);
  if (sideBar) showSidebar(node);
};

export const setupSearchEventListener = () => {
  document
    .getElementById("search-input")
    ?.addEventListener("keydown", checkSearchInput);
};

export const setupSearchButtonListener = () => {
  document.getElementById("search-btn")?.addEventListener("click", searchNode);
};
