// src/graph/sidebar/utilities.js

export function tweakDisableGesture() {
  document.addEventListener("gesturestart", function (event) {
    event.preventDefault();
  });
}

export function toggleSearchContainer(onOff = false) {
  document.getElementById("search-container").style.display = onOff
    ? "block"
    : "none";
}
