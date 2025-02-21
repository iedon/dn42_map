// src/index.js

import { getGraphData } from "./graph/api";
import { initMap } from "./graph/map";
import { showMetadata, toggleSearchContainer, tweakDisableGesture, showMyDN42Ip } from "./graph/sidebar";

window.onload = async function() {
  try {
    showMyDN42Ip();
    tweakDisableGesture();
    toggleSearchContainer(false);

    const data = await getGraphData();
    const binFileDate = new Date(data.metadata.generated_timestamp * 1000).toLocaleString();
    const mrtDumpDate = new Date(data.metadata.data_timestamp * 1000).toLocaleString();
    console.log(`🔨 Map data parsed.\n Binary generated on: ${binFileDate}\n MRT dump date: ${mrtDumpDate}`);

    initMap(data, "#map");

    showMetadata(mrtDumpDate);
    toggleSearchContainer(true);

    console.log("✅ Graph initialized successfully.");

  } catch (error) {
    console.error("❌ Error initializing the graph: ", error);
    alert(`Error initializing the graph.\n${error}`);
  }
}
