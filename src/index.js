// src/index.js
import {
  initLoading,
  setLoadingState,
  updateLoadingPercentage,
  finishLoading,
} from "./loading.js";
import { getGraphData } from "./graph/api";
import { initMap } from "./graph/map";
import {
  showMetadata,
  toggleSearchContainer,
  tweakDisableGesture,
  showMyDN42Ip,
} from "./graph/sidebar/index.js";
import { initTimeMachine, setCurrentMapVersion } from "./graph/timeMachine.js";

window.onload = async function () {
  try {
    initLoading();

    showMyDN42Ip();
    tweakDisableGesture();
    toggleSearchContainer(false);

    // Get query string "data" for map data URL, if null, use latest data
    const urlParams = new URLSearchParams(window.location.search);
    const data = await getGraphData(urlParams.get("data"));

    // Extract current map version from timestamp for tracking
    const mrtDate = new Date(data.metadata.data_timestamp * 1000);
    initTimeMachine();
    setCurrentMapVersion(mrtDate.toLocaleString());
    showMetadata(mrtDate.toLocaleString());
    toggleSearchContainer(true);

    initMap(
      data,
      "#map",
      setLoadingState,
      updateLoadingPercentage,
      finishLoading
    );
  } catch (error) {
    console.error("❌ Error initializing the graph: ", error);
    alert(`Error initializing the graph.\n${error}`);
  }
};
