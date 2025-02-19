// src/index.js

import { getGraphData } from "./graph/data";
import { initMap } from "./graph/map";
import { showMetadata, toggleSearchContainer, tweakDisableGesture } from "./graph/sidebar";

window.onload = async function() {
  try {
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
