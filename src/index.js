// src/index.js

import { getGraphData } from "./graph/api";
import { initMap } from "./graph/map";
import {
  showMetadata,
  toggleSearchContainer,
  tweakDisableGesture,
  showMyDN42Ip,
} from "./graph/sidebar";

let loadingOverlay = null;
let loadingSpinner = null;
let loadingText = null;
let loadingPercentage = null;

function setLoadingState(state) {
  if (!loadingSpinner || !loadingText || !loadingPercentage) return;
  if (state === "parsing") {
    loadingSpinner.className = "loading-spinner fetching";
    loadingText.textContent = "Preprocessing DN42 Map Data";
    loadingPercentage.style.display = "none";
  } else if (state === "rendering") {
    loadingSpinner.className = "loading-spinner rendering";
    loadingText.textContent = "Rendering DN42 Network Map";
    loadingPercentage.style.display = "block";
    loadingPercentage.textContent = "0%";
    updateProgressRing(0);
  }
}

function finishLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
    // Remove the overlay from DOM after transition
    setTimeout(() => {
      if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
      }
    }, 500);
  }
}

function updateLoadingPercentage(alpha) {
  if (loadingPercentage) {
    // Alpha starts at 1.0 and decreases towards 0
    // Convert to percentage (0% at alpha=1.0, 100% at alpha=0)
    let percentage = Math.max(
      0,
      Math.min(100, Math.round(((1.0 - alpha) / 1.0) * 100))
    );

    // Ensure we show 100% when alpha is very low(<0.02, defined in map.js)
    if (percentage >= 98) percentage = 100;
    loadingPercentage.textContent = `${percentage}%`;

    // Update progress ring
    updateProgressRing(percentage);
  }
}

function updateProgressRing(percentage) {
  if (!loadingSpinner || !loadingSpinner.classList.contains("rendering"))
    return;

  // Calculate the angle for conic-gradient (0% = 0deg, 100% = 360deg)
  // Starting from top (0deg) and going clockwise
  const angle = (percentage / 100) * 360;

  // Update the conic-gradient background - starts from top (0deg)
  loadingSpinner.style.background = `conic-gradient(from 0deg, #ce8815 0deg, #ce8815 ${angle}deg, transparent ${angle}deg)`;
}

window.onload = async function () {
  try {
    loadingOverlay = document.getElementById("loading-overlay");
    loadingPercentage = document.querySelector(".loading-percentage");
    loadingSpinner = document.querySelector(".loading-spinner");
    loadingText = document.querySelector(".loading-text");

    showMyDN42Ip();
    tweakDisableGesture();
    toggleSearchContainer(false);

    const data = await getGraphData();
    const binFileDate = new Date(
      data.metadata.generated_timestamp * 1000
    ).toLocaleString();
    const mrtDumpDate = new Date(
      data.metadata.data_timestamp * 1000
    ).toLocaleString();
    console.log(
      `🔨 Map binary generated on: ${binFileDate}\n MRT dump date: ${mrtDumpDate}`
    );

    initMap(data, "#map", setLoadingState, updateLoadingPercentage, finishLoading);

    showMetadata(mrtDumpDate);
    toggleSearchContainer(true);
  } catch (error) {
    console.error("❌ Error initializing the graph: ", error);
    alert(`Error initializing the graph.\n${error}`);
  }
};
