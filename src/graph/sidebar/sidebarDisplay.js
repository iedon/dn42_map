// src/graph/sidebar/sidebarDisplay.js

import { getWhoisData } from "../api.js";
import { getMap, getShowingSideBar, setShowingSideBar } from "./sidebarCore.js";
import {
  createSearchInput,
  debouncedRankingSearch,
  debouncedNeighborsSearch,
  sortTableByColumn,
  resetSortState,
} from "./tableUtils.js";
import {
  generateCentralityCard,
  generateRoutesTable,
  generateNeighborsTable,
  generateRankingTable,
  generateWhoisContent,
} from "./htmlGenerators.js";

// Cache for WHOIS data
const whoisCache = {};
let showingRanking = false;

// Display sidebar with node details and whois information
export async function showSidebar(node) {
  const map = getMap();
  setShowingSideBar(true);

  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");

  // Showing ranking
  if (!node) {
    await showRankingView(map, sidebar, sidebarContent);
    return;
  }

  // Showing individual node
  await showNodeView(node, map, sidebar, sidebarContent);
}

async function showRankingView(map, sidebar, sidebarContent) {
  document.getElementById("sidebar-title").innerText = "Ranking";

  const searchInput = createSearchInput(
    "Search by ASN or Name...",
    "window.searchRankingTable(this.value)"
  );
  const tableHtml = generateRankingTable(map.nodes, searchInput);

  sidebarContent.innerHTML = tableHtml;
  sidebar.style.left = "0";
  sidebar.scrollTop = 0;

  // Set up search functionality
  window.searchRankingTable = debouncedRankingSearch;

  resetSortState();
  window.sortTableByColumn(0, "number"); // Sort by rank initially
}

async function showNodeView(node, map, sidebar, sidebarContent) {
  document.getElementById("sidebar-title").innerText = node.desc;

  const header = generateCentralityCard(node);
  const routes = generateRoutesTable(node);

  const neighborsSearchInput = createSearchInput(
    "Search neighbors by ASN or Name...",
    "window.searchNeighborsTable(this.value)"
  );
  const neighbors = generateNeighborsTable(node, map, neighborsSearchInput);

  // Show sidebar
  sidebar.style.left = "0";

  // Check cache first
  const cache = whoisCache[node.asn];
  if (cache) {
    sidebarContent.innerHTML = cache;
    sidebar.scrollTop = 0;
    setupNeighborsSearch();
    resetSortState();
    window.sortTableByColumn(0, "number");
    return;
  }

  // Show loading state
  sidebarContent.innerHTML =
    header + "<p>Querying whois database...</p>" + routes + neighbors;
  sidebar.scrollTop = 0;
  setupNeighborsSearch();

  try {
    const whoisData = await getWhoisData(node.asn);
    const whoisContent = generateWhoisContent(whoisData, node.asn);

    // Regenerate neighbors with search functionality for caching
    const updatedNeighbors = generateNeighborsTable(
      node,
      map,
      neighborsSearchInput
    );
    const output = header + whoisContent + routes + updatedNeighbors;

    whoisCache[node.asn] = output;
    sidebarContent.innerHTML = output;

    setupNeighborsSearch();
  } catch (error) {
    console.error("Error querying whois API:", error);
    sidebarContent.innerHTML =
      header + "<p>Error querying whois API.</p>" + routes + neighbors;
    setupNeighborsSearch();
  }

  resetSortState();
  window.sortTableByColumn(0, "number");
}

function setupNeighborsSearch() {
  window.searchNeighborsTable = debouncedNeighborsSearch;
}

export function closeSideBar() {
  setShowingSideBar(false);
  showingRanking = false;
  document.getElementById("sidebar").style.left = "-500px";
}

// Global window functions
window.toggleRanking = () => {
  if (showingRanking && getShowingSideBar()) {
    closeSideBar();
  } else {
    showSidebar();
    showingRanking = true;
  }
};

window.sortTableByColumn = sortTableByColumn;
