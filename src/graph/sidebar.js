// src/graph/sidebar.js

import { constants } from "../constants";
import { getMyIpData, getWhoisData } from "./api";

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
    sidebarContent.innerHTML = `<div class="whois"><table><thead><tr><th class="key rank">Rank</th><th class="key asn">ASN</th><th class="key name">Name</th><th class="key index">Index</th></tr></thead><tbody>${map.nodes.sort((a, b) => a.centrality.ranking - b.centrality.ranking).map((node, i) => `<tr ${onclick(node.asn)}><td class="rank">${i + 1}</td><td class="asn">${node.asn}</td><td class="name">${node.label || "-"}</td><td class="index">${node.centrality.index}</td></tr>`).join("")}</tbody></table></div>`;
    sidebar.style.left = "0";
    sidebar.scrollTop = 0;
    return;
  }

  document.getElementById("sidebar-title").innerText = node.desc;
  const routes = `<p class="emphasized">Routes (${node.routes.length})</p><ul>${node.routes.map(route =>`<li><a href="${constants.dn42.explorerUrl}${route.replace("/", "_")}" target="_blank"}>${route}</a></li>`).join("")}</ul>`;
  const neighbors = `<p class="emphasized">Neighbors (${node.peers.size})</p><div class="whois"><table><thead><tr><th class="key asn">ASN</th><th class="key name">Name</th><th class="key to">To</th><th class="key from">From</th></tr></thead><tbody>${[...node.peers].map(peerAsn => `<tr ${onclick(peerAsn)}><td class="asn">${peerAsn}</td><td class="name">${map.nodeMap.get(peerAsn.toString())?.label || "-"}</td><td class="to">${map.linkMap.has(`${peerAsn}_${node.asn}`) ? "✅" : ""}</td><td class="from">${map.linkMap.has(`${node.asn}_${peerAsn}`) ? "✅" : ""}</td></tr>`).join("")}</tbody></table></div>`;

  const renderCentralityCard = () => `<div class="centrality"><div class="param"><div>Degree <strong>${node.centrality.degree}</strong></div><div>Betweenness <strong>${node.centrality.betweenness}</strong></div><div>Closeness <strong>${node.centrality.closeness.toFixed(4)}</strong></div></div><div class="index"><span>Map.dn42 Index</span><strong>${node.centrality.index}</strong></div><div class="rank"><span>Rank</span><strong># ${node.centrality.ranking}</strong></div></div>`;

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
}

window.toggleRanking = showSidebar;

export function closeSideBar() {
  showingSideBar = false;
  document.getElementById("sidebar").style.left = "-500px";
}

export function showMetadata(mrtDumpDate) {
  document.getElementById("metadata").innerHTML =
  `<a href="${constants.dn42.homeUrl}" target="_blank">DN42 Home</a> | ` +
  `<a href="${constants.dn42.peerFinderUrl}" target="_blank">Peer Finder</a> | ` +
  `<a href="${constants.dn42.routeGraphsUrl}" target="_blank">Routegraphs</a> | ` +
  // `<a onclick="javascript:window.dumpJson()">Dump</a> | ` +
  `<a href="${constants.dn42.rawJsonApiUrl}" target="_blank">JSON</a> | ` +
  `<a onclick="javascript:window.toggleRanking()">Ranking</a> | ` +
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

  if (!node) return;

  map.hoveredNode = node;
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
export const getShowingSideBar = () => showingSideBar;
