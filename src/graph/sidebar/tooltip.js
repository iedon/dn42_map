// src/graph/sidebar/tooltip.js

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
  const tooltip = document.getElementById("tooltip");
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
  const routes = node.routes.map((r) => `<li>${r}</li>`).join("");
  if (routes) advertisedRoutes = `<p>Advertised routes:</p><ul>${routes}</ul>`;

  return `<div class="nodeInfo">${title}${peers}${advertisedRoutes}</div>`;
}
