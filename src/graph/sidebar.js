// src/graph/sidebar.js

import { constants } from "../constants";
import { getMyIpData, getWhoisData } from "./api";
import { select } from "d3-selection";
import { zoomIdentity } from "d3-zoom";

let map, showingSideBar;
export const initSidebar = m => { map = m };

export function tweakDisableGesture() {
  document.addEventListener('gesturestart', function (event) {
    event.preventDefault();
  });
}

export function toggleSearchContainer(onOff = false) {
  document.getElementById("search-container").style.display = onOff ? "block" : "none";
}

// Display sidebar with node details and whois information
const whoisCache = {};
export async function showSidebar(node) {
  showingSideBar = true;
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const onclick = asn => `onclick="javascript:window.navigateToNode(${asn},true)"`;

  // Showing ranking
  if (!node) {
    document.getElementById("sidebar-title").innerText = "Ranking";
    sidebarContent.innerHTML = `<div class="whois"><table class="sortable"><thead><tr><th class="key rank" onclick="javascript:window.sortTableByColumn(0,'number')">Rank</th><th class="key asn" onclick="javascript:window.sortTableByColumn(1,'number')">ASN</th><th class="key name" onclick="javascript:window.sortTableByColumn(2)">Name</th><th class="key index" onclick="javascript:window.sortTableByColumn(3,'number')">Index</th></tr></thead><tbody>${map.nodes.sort((a, b) => a.centrality.ranking - b.centrality.ranking).map((node, i) => `<tr ${onclick(node.asn)}><td class="rank">${i + 1}</td><td class="asn">${node.asn}</td><td class="name">${node.label || "-"}</td><td class="index">${node.centrality.index}</td></tr>`).join("")}</tbody></table></div>`;
    sidebar.style.left = "0";
    sidebar.scrollTop = 0;

    currentSortColumn = -1;
    window.sortTableByColumn(0, "number"); // Sort by rank initially
    return;
  }

  document.getElementById("sidebar-title").innerText = node.desc;
  const routes = `<p class="emphasized">Routes (${node.routes.length})</p><div class="whois"><table><tbody>${node.routes.map(route =>`<tr><td class="center">${route}</td><td class="right"><a href="${constants.dn42.explorerUrl}${route.replace("/", "_")}" target="_blank"}>Registry</a>&nbsp;&nbsp;<a href="${constants.dn42.routeGraphsUrl}?ip_prefix=${encodeURIComponent(route)}&asn=${constants.dn42.routeGraphInitiateAsn}" target="_blank"}>Graph</a>&nbsp;&nbsp;<a href="${constants.dn42.queryRoutesUrl}${route}" target="_blank"}>Show</a></td></tr>`).join("")}</tbody></table></div>`;

  const neighbors = `<p class="emphasized">Neighbors (${node.peers.size})</p><div class="whois"><table class="sortable"><thead><tr><th class="key asn" onclick="javascript:window.sortTableByColumn(0,'number')">ASN</th><th class="key name" onclick="javascript:window.sortTableByColumn(1)">Name</th><th class="key to" onclick="javascript:window.sortTableByColumn(2)">To</th><th class="key from" onclick="javascript:window.sortTableByColumn(3)">From</th></tr></thead><tbody>${[...node.peers].map(peerAsn => `<tr ${onclick(peerAsn)}><td class="asn">${peerAsn}</td><td class="name">${map.nodeMap.get(peerAsn.toString())?.label || "-"}</td><td class="to">${map.linkMap.has(`${peerAsn}_${node.asn}`) ? "✅" : ""}</td><td class="from">${map.linkMap.has(`${node.asn}_${peerAsn}`) ? "✅" : ""}</td></tr>`).join("")}</tbody></table></div>`;

  const renderCentralityCard = () => `<div class="centrality"><div class="param"><div>Betweenness <strong>${node.centrality.betweenness.toFixed(5)}</strong></div><div>Closeness <strong>${node.centrality.closeness.toFixed(5)}</strong></div><div>Degree <strong>${node.centrality.degree}</strong></div></div><div class="index"><span>Map.dn42 Index</span><strong>${node.centrality.index}</strong></div><div class="rank"><span>Rank</span><strong># ${node.centrality.ranking}</strong></div></div>`;

  const header = renderCentralityCard();

  const updateWithWhois = (whois, asn) => {
    const urlRegex = /(http:\/\/|https:\/\/)((\w|=|\?|\.|\/|&|-)+)/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const prefix = `<a href="${constants.dn42.explorerUrl}${asn}" target="_blank">Reveal in DN42 Registry Explorer</a><br/>`;
    let remarks = "<div class=\"remarks\">";
    const whoisRows = whois
      .split("\n")
      .map(l => {
        const [k, v] = l.split(/:\x20(.+)?/, 2);
        if (!k || !v) return "";
        const vv = v
          .trim()
          .replace(urlRegex, "<a href='$1$2' target='_blank'>$1$2</a>")
          .replace(emailRegex, email => `<a href="mailto:${email}">${email}</a>`);
        if (k.trim() === "remarks") {
          if (!vv) return "";
          const remark = vv.replace(/(<a\b[^>]*>.*?<\/a>)|\x20/g, (_, group1) => {
            return group1 ? group1 : "&nbsp;";
          });
          remarks += `<p>${remark}</p>`;
          return "";
        }
        return `<tr><td class="key">${k.trim()}</td><td>${vv}</td></tr>`;
      })
      .join("");
    remarks += "</div>";
    const proceed = prefix + `<div class="whois"><table><tbody>${whoisRows}</tbody></table>${remarks}</div>`;
    const output = header + proceed + routes + neighbors;
    whoisCache[asn] = output;
    return output;
  };

  // Show sidebar
  sidebar.style.left = "0";

  // Fetch WHOIS information via API
  const cache = whoisCache[node.asn];
  if (!cache) {
    sidebarContent.innerHTML = header + "<p>Querying whois database...</p>" + routes + neighbors;
    sidebar.scrollTop = 0;
    try {
      sidebarContent.innerHTML = updateWithWhois(await getWhoisData(node.asn), node.asn);
    } catch (error) {
      console.error("Error querying whois API:", error);
      sidebarContent.innerHTML = header + "<p>Error querying whois API.</p>" + routes + neighbors;
    }
  } else {
    sidebarContent.innerHTML = cache;
    sidebar.scrollTop = 0;
  }
  currentSortColumn = -1;
  window.sortTableByColumn(0, "number"); // Sort by ASN initially
}

window.toggleRanking = showSidebar;

let currentSortColumn = -1;
let sortAsc = true;
window.sortTableByColumn = (colIndex, colType="string") => {
  const thead = document.querySelector("table.sortable thead");
  const tbody = document.querySelector("table.sortable tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const headers = thead.querySelectorAll("th");

  // Remove previous sort indicators
  headers.forEach(th => th.classList.remove("sort-asc", "sort-desc"));

  // Toggle direction if same column; otherwise reset
  if (currentSortColumn === colIndex) {
    sortAsc = !sortAsc;
  } else {
    currentSortColumn = colIndex;
    sortAsc = true;
  }

  // Add new sort class
  headers[colIndex].classList.add(sortAsc ? "sort-asc" : "sort-desc");

  // Sort rows
  rows.sort((a, b) => {
    const aText = a.cells[colIndex].textContent.trim();
    const bText = b.cells[colIndex].textContent.trim();

    if (colType === "number") {
      return (Number(aText) - Number(bText)) * (sortAsc ? 1 : -1);
    }

    return aText.localeCompare(bText) * (sortAsc ? 1 : -1);
  });

  // Re-append sorted rows
  rows.forEach(row => tbody.appendChild(row));
};

export function closeSideBar() {
  showingSideBar = false;
  document.getElementById("sidebar").style.left = "-500px";
}

export function showMetadata(mrtDumpDate) {
  document.getElementById("metadata").innerHTML =
  `<a href="${constants.dn42.homeUrl}" target="_blank">DN42</a> | ` +
  `<a href="${constants.dn42.peerFinderUrl}" target="_blank">Peer Finder</a> | ` +
  `<a href="${constants.dn42.routeGraphsUrl}" target="_blank">Routegraph</a> | ` +
  `<a href="${constants.dn42.toolboxUrl}" target="_blank">Tools</a> | ` +
  // `<a onclick="javascript:window.dumpJson()">Dump</a> | ` +
  `<a href="${constants.dn42.rawJsonApiUrl}" target="_blank">API</a> | ` +
  `<a onclick="javascript:window.toggleRanking()">Rank</a> | ` +
  `${mrtDumpDate}`;
}

export async function showMyDN42Ip() {
  try {
    if (constants.dn42.accessingFromDn42) {
      const myip = document.getElementById("myip");
      const data = await getMyIpData();
      let output = "";
      if (data.country) output += `<img src="flags/${data.country.toLowerCase()}.svg" width="16" height="16" alt="${data.ip}"/>&nbsp;&nbsp;`;
      if (data.ip) output += `IP&nbsp;&nbsp;<a href="${constants.dn42.myIpUrl}" target="_blank">${data.ip}</a>&nbsp;`;
      if (data.origin) output += `(<a onclick="javascript:window.navigateToNode(${Number(data.origin.replace("AS",""))},true)">${data.origin}</a>)`;
      if (data.netname) output += `&nbsp;|&nbsp;from&nbsp;${data.netname}`;
      myip.innerHTML = output;
      myip.style.display = "flex";
    }
  } catch(error) {
    console.error(`Failed to get source IP information. ${error}`);
    myip.style.display = "none";
  }
}

export function showTooltip(event, node) {
  const tooltip = document.getElementById("tooltip");
  if (tooltip) {
    tooltip.innerHTML = generateTooltipHtml(node);
    tooltip.style.display = "block";
    updateTooltipPosition(event);
  }
}

export function hideTooltip() {
  const tooltip = document.getElementById("tooltip");
  if (tooltip) tooltip.style.display = "none";
}

function updateTooltipPosition(event) {
  const mouseX = event.clientX;
  const mouseY = event.clientY;

  // Offset the tooltip slightly from the cursor
  const offsetX = 10;
  const offsetY = 10;

  tooltip.style.left = `${mouseX + offsetX}px`;
  tooltip.style.top = `${mouseY + offsetY}px`;
}

function generateTooltipHtml(node) {
  let source = "";
  let tag = "";
  let desc = node.desc;
  if (node.desc.includes("-DN42")) {
    source = "DN42";
    desc = node.desc.replace("-DN42", "");
  } else if (node.desc.includes("-NEONETWORK")) {
    source = "NEONETWORK";
    desc = node.desc.replace("-NEONETWORK", "");
  } else if (node.desc.includes("ICVPN-")) {
    source = "ICVPN";
    desc = node.desc.replace("ICVPN-", "");
  } else if (node.desc.includes("-CRXN")) {
    source = "CRXN";
    desc = node.desc.replace("-CRXN", "");
  }
  if (source) tag = `<span class="tag">${source}</span>&nbsp;`;

  const title = `<div class="title">${tag}<b>${desc} (AS${node.asn})</b></div>`;
  const peers = `<p>Neighbors: ${node.peers.size}</p>`;
  let advertisedRoutes = "";
  const routes = node.routes.map(r => `<li>${r}</li>`).join("");
  if (routes) advertisedRoutes = `<p>Advertised routes:</p><ul>${routes}</ul>`;
  return `<div class="nodeInfo">${title}${peers}${advertisedRoutes}</div>`;
}

// Center the graph on the given node and show details in sidebar
export const navigateToNode = nodeOrAsn => {
  const node = typeof nodeOrAsn === "number"
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
window.navigateToNode = (nodeOrAsn, sideBar=false) => {
  const node = typeof nodeOrAsn === "number"
    ? map.nodeMap.get(nodeOrAsn.toString())
    : nodeOrAsn;

  if (!node) return;

  navigateToNode(node);
  if (sideBar) showSidebar(node);
};

// Search for a node based on input value
function searchNode() {
  const value = document.getElementById("search-input").value;
  if (!value.length) return;
  const query = value.toLowerCase();
  const node = map.nodeMap.get(query);
  if (node) {
    navigateToNode(node);
    showSidebar(node);
  } else {
    // alert("Node not found.");
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

export const checkSearchInputEventListener = () => document.getElementById("search-input").addEventListener("keydown", checkSearchInput);
export const closeSideBarEventListener = () => document.getElementById("close-sidebar").addEventListener("click", closeSideBar);
export const searchNodeEventListener = () => document.getElementById("search-btn").addEventListener("click", searchNode);
export const getShowingSideBar = () => showingSideBar;
