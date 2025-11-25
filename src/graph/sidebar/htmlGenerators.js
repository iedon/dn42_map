// src/graph/sidebar/htmlGenerators.js

import { constants } from "../../constants.js";

export const generateCentralityCard = (node) => {
  return `
    <div class="centrality">
      <div class="param">
        <div>Betweenness <strong>${node.centrality.betweenness.toFixed(5)}</strong></div>
        <div>Closeness <strong>${node.centrality.closeness.toFixed(5)}</strong></div>
        <div>Degree <strong>${node.centrality.degree}</strong></div>
      </div>
      <div class="index">
        <span>Map.dn42 Index</span>
        <strong>${node.centrality.index}</strong>
      </div>
      <div class="rank">
        <span>Rank</span>
        <strong># ${node.centrality.ranking}</strong>
      </div>
    </div>
  `;
};

export const generateRoutesTable = (node) => {
  const routeRows = node.routes.map(route => `
    <tr>
      <td class="mono">${route}</td>
      <td class="right">
        <a href="${constants.dn42.explorerUrl}${route.replace("/", "_")}" target="_blank">Registry</a>&nbsp;&nbsp;
        <a href="${constants.dn42.routeGraphsUrl}?ip_prefix=${encodeURIComponent(route)}&asn=${constants.dn42.routeGraphInitiateAsn}" target="_blank">Graph</a>&nbsp;&nbsp;
        <a href="${constants.dn42.queryRoutesUrl}${route}" target="_blank">Show</a>
      </td>
    </tr>
  `).join("");

  return `
    <p class="emphasized">Routes (${node.routes.length})</p>
    <div class="whois">
      <table>
        <tbody>${routeRows}</tbody>
      </table>
    </div>
  `;
};

export const generateNeighborsTable = (node, map, searchInput) => {
  const onclick = asn => `onclick="javascript:window.navigateToNode(${asn},true)"`;
  
  const neighborRows = [...node.peers].map(peerAsn => `
    <tr ${onclick(peerAsn)}>
      <td class="asn">${peerAsn}</td>
      <td class="name">${map.nodeMap.get(peerAsn.toString())?.label || "-"}</td>
      <td class="to">${map.linkMap.has(`${peerAsn}_${node.asn}`) ? "✔" : ""}</td>
      <td class="from">${map.linkMap.has(`${node.asn}_${peerAsn}`) ? "✔" : ""}</td>
    </tr>
  `).join("");

  const tableHeader = `
    <thead>
      <tr>
        <th class="key asn" onclick="javascript:window.sortTableByColumn(0,'number')">ASN</th>
        <th class="key name" onclick="javascript:window.sortTableByColumn(1)">Name</th>
        <th class="key to" onclick="javascript:window.sortTableByColumn(2)">Sends Transit</th>
        <th class="key from" onclick="javascript:window.sortTableByColumn(3)">Recvs Transit</th>
      </tr>
    </thead>
  `;

  return `
    <p class="emphasized">Neighbors (${node.peers.size})</p>
    ${searchInput}
    <div class="whois">
      <table class="sortable neighbors-table">
        ${tableHeader}
        <tbody>${neighborRows}</tbody>
      </table>
    </div>
  `;
};

export const generateRankingTable = (nodes, searchInput) => {
  const onclick = asn => `onclick="javascript:window.navigateToNode(${asn},true)"`;
  
  const rankingRows = nodes
    .sort((a, b) => a.centrality.ranking - b.centrality.ranking)
    .map((node, i) => `
      <tr ${onclick(node.asn)}>
        <td class="rank">${i + 1}</td>
        <td class="asn">${node.asn}</td>
        <td class="name">${node.label || "-"}</td>
        <td class="index">${node.centrality.index}</td>
      </tr>
    `).join("");

  const tableHeader = `
    <thead>
      <tr>
        <th class="key rank" onclick="javascript:window.sortTableByColumn(0,'number')">Rank</th>
        <th class="key asn" onclick="javascript:window.sortTableByColumn(1,'number')">ASN</th>
        <th class="key name" onclick="javascript:window.sortTableByColumn(2)">Name</th>
        <th class="key index" onclick="javascript:window.sortTableByColumn(3,'number')">Index</th>
      </tr>
    </thead>
  `;

  return `
    ${searchInput}
    <div class="whois">
      <table class="sortable ranking-table">
        ${tableHeader}
        <tbody>${rankingRows}</tbody>
      </table>
    </div>
  `;
};

export const generateWhoisContent = (whois, asn) => {
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
  
  return prefix + `<div class="whois"><table><tbody>${whoisRows}</tbody></table>${remarks}</div>`;
};
