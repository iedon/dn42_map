let loadingOverlay = null;
let loadingSpinner = null;
let loadingText = null;
let loadingPercentage = null;

export const initLoading = () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingPercentage = document.querySelector(".loading-percentage");
  loadingSpinner = document.querySelector(".loading-spinner");
  loadingText = document.querySelector(".loading-text");
};

export const setLoadingState = (state, textOverride) => {
  if (!loadingSpinner || !loadingText || !loadingPercentage) return;

  loadingOverlay.style.display = "flex";
  loadingOverlay.classList.remove("hidden");

  loadingSpinner.className = "loading-spinner fetching";
  loadingSpinner.style.background = "none";
  loadingPercentage.style.display = "none";

  if (state === "fetching") {
    loadingText.textContent = textOverride || "Fetching";
  } else if (state === "parsing") {
    loadingText.textContent = textOverride || "Preprocessing DN42 Map Data";
  } else if (state === "rendering") {
    loadingSpinner.className = "loading-spinner rendering";
    loadingPercentage.style.display = "block";
    loadingPercentage.textContent = "0%";
    loadingText.textContent = textOverride || "Rendering DN42 Network Map";
    updateProgressRing(0);
  }
};

export const finishLoading = () => {
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
    // Hide the overlay from DOM after transition(opacity)
    setTimeout(() => {
      if (loadingOverlay) {
        loadingOverlay.style.display = "none";
      }
    }, 500);
  }
};

const updateProgressRing = (percentage) => {
  if (!loadingSpinner || !loadingSpinner.classList.contains("rendering"))
    return;

  // Calculate the angle for conic-gradient (0% = 0deg, 100% = 360deg)
  // Starting from top (0deg) and going clockwise
  const angle = (percentage / 100) * 360;

  // Update the conic-gradient background - starts from top (0deg)
  loadingSpinner.style.background = `conic-gradient(from 0deg, #ce8815 0deg, #ce8815 ${angle}deg, transparent ${angle}deg)`;
};

export const updateLoadingPercentage = (alpha) => {
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
};
