"use strict";

// *****************************
// DN42 Map
// IEDON-MNT
// 2025
// *****************************

// *****************************
// Color & Style Constants
// *****************************
const VAR_MAP_VENDOR_MAGIC = "IEDON.NET";
const VAR_MAP_DEFAULT_SCALE = 1.5;
const VAR_MAP_BACKGROUND_COLOR = "#f0f0f0";
const VAR_NODE_COLOR_DEFAULT = "mediumaquamarine";
const VAR_NODE_COLOR_CURRENT = "orangered";
const VAR_NODE_COLOR_LINKED = "orange";
const VAR_LINK_COLOR_DEFAULT = "#ffe5cc";
const VAR_LINK_COLOR_EMPHASIZE = "lightpink";
const VAR_LINK_WIDTH_DEFAULT = 1;
const VAR_LINK_WIDTH_EMPHASIZE = 2;
const VAR_NODE_LABEL_COLOR = "#333";
const VAR_NODE_LABEL_FONT_SIZE_PX = 6;
const VAR_NODE_LABEL_FONT_FAMILY = "Inter, sans-serif";
const VAR_IS_DN42_ACCESS = (window.location.href.indexOf(".dn42") !== -1);
const VAR_DN42_WHOIS_API = "https://api.iedon.com/dn42/whois";
const VAR_DN42_EXPLORER_URL = VAR_IS_DN42_ACCESS
  ? "http://explorer.burble.dn42/?#/"
  : "https://explorer.burble.com/?#/";
const VAR_DN42_HOME = VAR_IS_DN42_ACCESS
  ? "https://wiki.dn42/"
  : "https://dn42.dev/";
const VAR_DN42_PEERFINDER = "https://dn42.us/peers/";

document.getElementById("search-container").style.display = "none";

// *****************************
// Utility Functions
// *****************************
function scaleSqrt(domain, range, value) {
  const [domainMin, domainMax] = domain;
  const [rangeMin, rangeMax] = range;
  const t = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + Math.sqrt(t) * (rangeMax - rangeMin);
}

/**
 * Compresses an IPv6 address string to its canonical form.
 *
 * @param {string} ip - An IPv6 address in full form (e.g. "fd42:4242:2189:0:0:0:0:0").
 * @returns {string} The compressed IPv6 address (e.g. "fd42:4242:2189::").
 */
function compressIPv6(ip) {
  // Split the IPv6 address into segments.
  let segments = ip.split(':');

  // Remove leading zeros from each segment.
  segments = segments.map(seg => {
    // Remove leading zeros; if the segment becomes empty, return "0".
    return seg.replace(/^0+/, '') || '0';
  });

  // Find the longest run of consecutive "0" segments.
  let bestStart = -1,
    bestLen = 0;
  let curStart = -1,
    curLen = 0;
  segments.forEach((seg, i) => {
    if (seg === '0') {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen++;
      }
    } else {
      if (curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
      curStart = -1;
      curLen = 0;
    }
  });
  // Check at the end in case the best sequence is at the end.
  if (curLen > bestLen) {
    bestStart = curStart;
    bestLen = curLen;
  }

  // If there is no sequence of two or more consecutive zeros, return the joined segments.
  if (bestLen < 2) {
    return segments.join(':');
  }

  // Build the compressed address:
  // - The part before the zero sequence.
  // - A double colon in place of the zero sequence.
  // - The part after the zero sequence.
  const left = segments.slice(0, bestStart);
  const right = segments.slice(bestStart + bestLen);
  let compressed = '';

  if (left.length > 0) {
    compressed += left.join(':');
  }
  compressed += '::';
  if (right.length > 0) {
    compressed += right.join(':');
  }

  return compressed;
}

/**
 * Reconstructs an IPv6 address from four 32-bit parts:
 *   high_h32 and high_l32 form the high 64 bits,
 *   low_h32 and low_l32 form the low 64 bits.
 * @param {number|string|bigint} high_h32 - Upper 32 bits of the high portion.
 * @param {number|string|bigint} high_l32 - Lower 32 bits of the high portion.
 * @param {number|string|bigint} low_h32  - Upper 32 bits of the low portion.
 * @param {number|string|bigint} low_l32  - Lower 32 bits of the low portion.
 * @returns {string} The full IPv6 address in expanded colon-delimited notation.
 */
function ipv6FromQuard32(high_h32, high_l32, low_h32, low_l32) {
  // Ensure all parts are handled as BigInts.
  high_h32 = BigInt(high_h32 || 0);
  high_l32 = BigInt(high_l32 || 0);
  low_h32 = BigInt(low_h32 || 0);
  low_l32 = BigInt(low_l32 || 0);

  // Combine the two 32-bit parts into a 64-bit value for the high and low portions.
  const high64 = (high_h32 << 32n) | high_l32;
  const low64 = (low_h32 << 32n) | low_l32;

  // Combine the high64 and low64 into the full 128-bit IPv6 address.
  const ip128 = (high64 << 64n) | low64;

  // Create an array to hold the eight 16-bit groups.
  const groups = [];
  // There are 8 groups of 16 bits each in a 128-bit IPv6 address.
  for (let i = 0; i < 8; i++) {
    // Calculate the shift amount to extract the corresponding group.
    const shift = 112n - 16n * BigInt(i);
    // Extract the current 16-bit group.
    const group = (ip128 >> shift) & 0xFFFFn;
    // Convert the group to a hexadecimal string and pad it to 4 digits.
    groups.push(group.toString(16).padStart(4, '0'));
  }
  // Join the groups with colons to form the final IPv6 address.
  const rawIPv6 = groups.join(':');
  return compressIPv6(rawIPv6);
}

// *****************************
// Graph and State Variables
// *****************************
let currentScaleLevel = VAR_MAP_DEFAULT_SCALE;
let hoveredNode = null;
let nodeMap = new Map();

// Create the force-directed graph
let graph = null;

// *****************************
// Load Data and Setup Graph
// *****************************
(async () => {
  try {
    const [request, proto] = await Promise.all([
      fetch(`map.pb?date=${+new Date()}`),
      protobuf.load("message.proto")
    ]);
    const dn42Graph = proto.lookupType("dn42graph.Graph");
    const uint8Array = new Uint8Array(await request.arrayBuffer());
    const decodedGraph = dn42Graph.decode(uint8Array);
    const data = dn42Graph.toObject(decodedGraph);

    if (data.metadata.vendor !== VAR_MAP_VENDOR_MAGIC) {
      alert("Invalid response data.\nUnexpected vendor magic.");
      return;
    }

    // Process the graph: iterate over nodes and access each route's CIDR.
    data.nodes.forEach(node => {
      node.routesParsed = [];
      node.routes?.forEach(route => {
        const length = route.length;
        // Check the oneof fields: either "ipv4" or "ipv6" is set.
        if (route.ipv4 != null) {
          // route.ipv4 is a 32-bit number; convert it to dotted-quad notation.
          const ipv4 = route.ipv4;
          const ipStr = [
            (ipv4 >> 24) & 0xff,
            (ipv4 >> 16) & 0xff,
            (ipv4 >> 8) & 0xff,
            ipv4 & 0xff
          ].join(".");
          node.routesParsed.push(`${ipStr}/${length}`);
        } else if (route.ipv6 != null) {
          const ipStr = ipv6FromQuard32(route.ipv6.highH32, route.ipv6.highL32, route.ipv6.lowH32, route.ipv6.lowL32);
          node.routesParsed.push(`${ipStr}/${length}`);
        } else {
          console.warn(`Unknown or empty IP route for AS${node.asn}`);
        }
      });
    });

    initMap(data);
  } catch (error) {
    console.error(error);
  }
})();

function initMap(data) {
  const parsedData = {
    nodes: [...data.nodes],
    links: [...data.links]
  };

  const { nodes, links } = parsedData;

  // Convert links to use actual node object references
  links.forEach(link => {
    link.source = nodes[link.source];
    link.target = nodes[link.target];
  });

  // Setup peers and fast lookup map for nodes
  nodes.forEach(node => {
    node.peers = new Set();
    nodeMap.set(node.asn.toString(), node);
    nodeMap.set(node.desc.toLowerCase(), node);

    node.label = node.desc
      .replace("-DN42", "")
      .replace("-MNT", "")
      .replace("-AS", "")
      .replace("-NEONETWORK", "")
      .replace("ICVPN-", "")
      .replace("-CRXN", "");
    node.labelFontSize = scaleSqrt(
      [0, 12],
      [VAR_NODE_LABEL_FONT_SIZE_PX / 4, VAR_NODE_LABEL_FONT_SIZE_PX],
      12 - node.label.length * 0.5
    );
  });

  links.forEach(link => {
    if (link.source && link.target) {
      link.source.peers.add(link.target.asn);
      link.target.peers.add(link.source.asn);
    }
  });

  // Scale node sizes based on peer count
  const maxPeers = Math.max(...nodes.map(n => n.peers.size), 1);
  nodes.forEach(node => {
    node.size = scaleSqrt([0, maxPeers], [3, 15], node.peers.size);
  });

  // Render the graph
  graph = ForceGraph()(document.getElementById("map"))
    .zoom(currentScaleLevel)
    .d3AlphaDecay(0.05)
    .backgroundColor(VAR_MAP_BACKGROUND_COLOR)
    .nodeColor(() => VAR_NODE_COLOR_DEFAULT)
    .linkColor(() => VAR_LINK_COLOR_DEFAULT)
    .linkWidth(VAR_LINK_WIDTH_DEFAULT)
    .nodeLabel(d => {
      let source = "";
      let tag = "";
      let desc = d.desc;
      if (d.desc.includes("-DN42")) {
        source = "DN42";
        desc = d.desc.replace("-DN42", "");
      } else if (d.desc.includes("-NEONETWORK")) {
        source = "NEONETWORK";
        desc = d.desc.replace("-NEONETWORK", "");
      } else if (d.desc.includes("ICVPN-")) {
        source = "ICVPN";
        desc = d.desc.replace("ICVPN-", "");
      } else if (d.desc.includes("-CRXN")) {
        source = "CRXN";
        desc = d.desc.replace("-CRXN", "");
      }
      if (source) tag = `<span class="tag">${source}</span>&nbsp;`;

      const title = `<div class="title">${tag}<b>${desc} (AS${d.asn})</b></div>`;
      const peers = `<p>Neighbors: ${d.peers.size}</p>`;
      let advertisedRoutes = "";
      const routes = d.routesParsed.map(r => `<li>${r}</li>`).join("");
      if (routes) advertisedRoutes = `<p>Advertised routes:</p><ul>${routes}</ul>`;
      return `<div class="nodeInfo">${title}${peers}${advertisedRoutes}</div>`;
    })
    .onNodeHover(node => highlightNode(node))
    .onNodeDrag(node => highlightNode(node))
    .onNodeClick(node => navigateToNode(node))
    .onBackgroundRightClick(() => closeSideBar())
    .onNodeRightClick(() => closeSideBar())
    .onLinkRightClick(() => closeSideBar())
    .onZoomEnd(({ k }) => {
      currentScaleLevel = k;
    })
    .graphData(parsedData)
    .nodeVal(d => d.size)
    .nodeCanvasObject((node, ctx) => {
      // Draw node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, 2 * Math.PI);
      ctx.fillStyle =
        node === hoveredNode
          ? VAR_NODE_COLOR_CURRENT
          : hoveredNode && hoveredNode.peers.has(node.asn)
            ? VAR_NODE_COLOR_LINKED
            : VAR_NODE_COLOR_DEFAULT;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Draw label if zoom level is sufficient
      if (currentScaleLevel >= 0.5) {
        const bold = node === hoveredNode ? "bold " : "";
        ctx.font = `${bold}${node.labelFontSize}px ${VAR_NODE_LABEL_FONT_FAMILY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = VAR_NODE_LABEL_COLOR;
        ctx.fillText(node.label, node.x, node.y + node.size + node.labelFontSize / 2 + 1);
      }
    });

  graph.d3Force("charge").strength(-300);

  document.getElementById("metadata").innerHTML =
    `<a href="${VAR_DN42_HOME}" target="_blank">DN42 Home</a> | ` +
    `<a href="${VAR_DN42_PEERFINDER}" target="_blank">Peer finder</a> | ` +
    `Last update: ${new Date(data.metadata.timestamp * 1000).toLocaleString()}`;
  document.getElementById("search-container").style.display = "block";
}

// *****************************
// Event Handlers & Utility Methods
// *****************************

// Highlight node and its linked neighbors
function highlightNode(node) {
  if (!graph || !node) return;

  hoveredNode = node;
  graph
    .nodeColor(d =>
      d === node
        ? VAR_NODE_COLOR_CURRENT
        : node && node.peers.has(d.asn)
          ? VAR_NODE_COLOR_LINKED
          : VAR_NODE_COLOR_DEFAULT
    )
    .linkColor(d =>
      d.source === node || d.target === node
        ? VAR_LINK_COLOR_EMPHASIZE
        : VAR_LINK_COLOR_DEFAULT
    )
    .linkWidth(d =>
      d.source === node || d.target === node
        ? VAR_LINK_WIDTH_EMPHASIZE
        : VAR_LINK_WIDTH_DEFAULT
    );
}

// Search for a node based on input value
function searchNode() {
  const query = document.getElementById("search-input").value.toLowerCase();
  const node = nodeMap.get(query);
  if (node) {
    navigateToNode(node);
  } else {
    alert("Node not found");
  }
}

// Center the graph on the given node and show details in sidebar
function navigateToNode(targetNode) {
  if (!graph) return;

  let node = targetNode;
  if (typeof targetNode === "string")
    node = nodeMap.get(targetNode) || targetNode;
  graph.centerAt(node.x, node.y, 500);
  graph.zoom(VAR_MAP_DEFAULT_SCALE, 500);
  highlightNode(node);
  showSidebar(node);
}

// Display sidebar with node details and whois information
const whoisCache = {};
function showSidebar(node) {
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebar-content");
  const onclick = asn => `onclick="javascript:navigateToNode('${asn}')"`;
  const header = `<p><b class="emphasized" ${onclick(node.asn)}>${node.desc}</b></p>`;
  const routes = `
    <p><strong class="emphasized">Routes (${node.routesParsed.length})</strong></p>
    <ul>
      ${node.routesParsed.map(route =>
        `<li><a href="${VAR_DN42_EXPLORER_URL}${route.replace("/", "_")}" target="_blank"}>${route}</a></li>`
      ).join("")}
    </ul>
  `;
  const neighbors = `
    <p><strong class="emphasized">Neighbors (${node.peers.size})</strong></p>
    <ul>
      ${[...node.peers]
      .map(
        peerAsn =>
          `<li><a ${onclick(
            peerAsn
          )}>${nodeMap.get(peerAsn.toString())?.desc || peerAsn}</a></li>`
      )
      .join("")}
    </ul>
  `;

  const updateWithWhois = (whois, asn) => {
    const urlRegex = /(http:\/\/|https:\/\/)((\w|=|\?|\.|\/|&|-)+)/g;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const prefix = `<a href="${VAR_DN42_EXPLORER_URL}${asn}" target="_blank">Reveal in DN42 Registry Explorer</a><br/>`;
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
          const remark = vv.replace(/(<a\b[^>]*>.*?<\/a>)|\x20/g, (match, group1) => {
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

  // Fetch WHOIS information via API
  const cache = whoisCache[node.asn];
  if (!cache) {
    fetch(VAR_DN42_WHOIS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ asn: node.asn })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Network status code error.");
        }
        return response.json();
      })
      .then(data => {
        if (!data.whois) {
          throw new Error("Network response error.");
        } else {
          sidebarContent.innerHTML = updateWithWhois(data.whois, node.asn);
        }
      })
      .catch(error => {
        console.error("Error querying whois API:", error);
        sidebarContent.innerHTML = header + "<p>Error querying whois API.</p>" + routes + neighbors;
      });

    // Fallback content while WHOIS info loads
    sidebarContent.innerHTML = header + "<p>Querying whois database...</p>" + routes + neighbors;
  } else {
    sidebarContent.innerHTML = cache;
  }

  // Show sidebar
  sidebar.style.left = "0";
}

function closeSideBar() {
  document.getElementById("sidebar").style.left = "-500px";
}

// *****************************
// Event Listeners
// *****************************

// Close sidebar on clicking the close button
document.getElementById("close-sidebar").addEventListener("click", closeSideBar);

// Adjust graph dimensions on window resize
window.addEventListener("resize", () => {
  if (graph) {
    graph.width(window.innerWidth);
    graph.height(window.innerHeight);
  }
});

// Attach search button functionality
document.getElementById("search-btn").addEventListener("click", searchNode);
