// src/graph/sidebar.js

import { constants } from "../constants";
import { getWhoisData } from "./data";
import { select } from "d3-selection";
import { zoomIdentity } from "d3-zoom";

let map;
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
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const onclick = asn => `onclick="javascript:window.navigateToNode(${asn})"`;
  const header = `<p><b class="emphasized clickable" ${onclick(node.asn)}>${node.desc}</b></p>`;
  const routes = `<p><strong class="emphasized">Routes (${node.routes.length})</strong></p><ul>${node.routes.map(route =>`<li><a href="${constants.dn42.explorerUrl}${route.replace("/", "_")}" target="_blank"}>${route}</a></li>`).join("")}</ul>`;
  const neighbors = `<p><strong class="emphasized">Neighbors (${node.peers.size})</strong></p><ul>${[...node.peers].map(peerAsn => `<li><a ${onclick(peerAsn)}>${map.nodeMap.get(peerAsn.toString())?.desc || peerAsn}</a></li>`).join("")}</ul>`;

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
}

export function closeSideBar() {
  document.getElementById("sidebar").style.left = "-500px";
}

export function showMetadata(mrtDumpDate) {
  document.getElementById("metadata").innerHTML =
  `<a href="${constants.dn42.homeUrl}" target="_blank">DN42 Home</a> | ` +
  `<a href="${constants.dn42.peerFinderUrl}" target="_blank">Peer finder</a> | ` +
  `Last update: ${mrtDumpDate}`;
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
    : nodeOrAsn || map.hoveredNode;

  if (!node) return;

  map.hoveredNode = node;
  map.draw();

  showSidebar(node);
};
window.navigateToNode = navigateToNode;

// Search for a node based on input value
function searchNode() {
  const value = document.getElementById("search-input").value;
  if (!value.length) return;
  const query = value.toLowerCase();
  const node = map.nodeMap.get(query);
  if (node) {
    navigateToNode(node);
  } else {
    alert("Node not found.");
  }
}

function checkSearchInput(event) {
  if (event.key === "Enter") searchNode();
  return false;
}

export const checkSearchInputEventListener = () => document.getElementById("search-input").addEventListener("keydown", checkSearchInput);
export const closeSideBarEventListener = () => document.getElementById("close-sidebar").addEventListener("click", closeSideBar);
export const searchNodeEventListener = () => document.getElementById("search-btn").addEventListener("click", searchNode);
