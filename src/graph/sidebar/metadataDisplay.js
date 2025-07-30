// src/graph/sidebar/metadataDisplay.js

import { constants } from "../../constants.js";
import { getMyIpData } from "../api.js";

export function showMetadata(mrtDumpDate) {
  const createIconButton = (href, title, iconPath, onclick = null) => {
    const clickHandler = onclick ? `onclick="${onclick}"` : "";
    const linkProps = href ? `href="${href}" target="_blank"` : "";
    return `
      <a ${linkProps} ${clickHandler} class="toolbar-icon" data-tooltip="${title}" aria-label="${title}">
        <img src="assets/icons/${iconPath}" alt="${title}" width="20" height="20">
      </a>
    `;
  };

  document.getElementById("metadata").innerHTML = `
    <div class="toolbar-icons">
      ${createIconButton(constants.dn42.homeUrl, "DN42 Home", "dn42.svg")}
      ${createIconButton(
        constants.dn42.peerFinderUrl,
        "DN42 Ping Finder",
        "peerfinder.svg"
      )}
      ${createIconButton(
        constants.dn42.routeGraphsUrl,
        "Route Graph by highdef",
        "routegraph.svg"
      )}
      ${createIconButton(
        constants.dn42.toolboxUrl,
        "Tools by Kioubit",
        "tools.svg"
      )}
      ${createIconButton(
        constants.dn42.rawJsonApiUrl,
        "API Services",
        "api.svg"
      )}
      ${createIconButton(
        null,
        "All active nodes and ranking",
        "ranking.svg",
        "javascript:window.toggleRanking()"
      )}
      ${createIconButton(
        null,
        `Time Machine (Date of current map: ${mrtDumpDate})`,
        "time.svg",
        "javascript:window.showMapVersions()"
      )}
    </div>
  `;
}

export async function showMyDN42Ip() {
  try {
    if (constants.dn42.accessingFromDn42) {
      const myip = document.getElementById("myip");
      const data = await getMyIpData();
      let output = "";

      if (data.country) {
        output += `<img src="assets/flags/${data.country.toLowerCase()}.svg" width="16" height="16" alt="${
          data.ip
        }"/>&nbsp;&nbsp;`;
      }
      if (data.ip) {
        output += `IP&nbsp;&nbsp;<a href="${constants.dn42.myIpUrl}" target="_blank">${data.ip}</a>&nbsp;`;
      }
      if (data.origin) {
        output += `(<a onclick="javascript:window.navigateToNode(${Number(
          data.origin.replace("AS", "")
        )},true)">${data.origin}</a>)`;
      }
      if (data.netname) {
        output += `&nbsp;|&nbsp;from&nbsp;${data.netname}`;
      }

      myip.innerHTML = output;
      myip.style.display = "flex";
    }
  } catch (error) {
    console.error(`Failed to get source IP information. ${error}`);
    const myip = document.getElementById("myip");
    if (myip) myip.style.display = "none";
  }
}
