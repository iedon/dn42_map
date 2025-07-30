// src/graph/mapVersions.js

import { constants } from "../constants.js";
import { getMapVersions } from "./api.js";

// Map version popup state
let mapVersionPopup = null;
let versionsData = null;
let currentMapVersion = "";
let selectedYear = new Date().getFullYear();
let selectedMonth = new Date().getMonth();

// Month names for display
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Creates the map version popup DOM element
 */
function createMapVersionPopup() {
  if (mapVersionPopup) return mapVersionPopup;

  const overlay = document.createElement("div");
  overlay.id = "map-version-overlay";
  overlay.innerHTML = `
    <div class="map-version-popup">
      <div class="map-version-header">
        <h2 class="map-version-title">
          Time Machine
        </h2>
        <button class="map-version-close" onclick="window.closeMapVersions()" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      
      <div class="map-version-nav">
        <div class="nav-left">Loaded: ${currentMapVersion}</div>
        <div class="quick-actions">
          <button class="quick-btn" onclick="window.loadLatestVersion()" aria-label="Load latest version">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
            </svg>
            Go to latest
          </button>
        </div>
      </div>

      <div id="map-version-content" class="map-version-content">
        <div class="map-version-loading">
          <div class="loading-spinner fetching"></div>
          <div class="loading-text">Loading map snapshots...</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  mapVersionPopup = overlay;

  return overlay;
}

/**
 * Formats filename to readable date
 */
function formatReadableDate(filename) {
  const match = filename.match(/map_(\d{4})_(\d{2})_(\d{2})\.bin/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return "";
}

/**
 * Parses filename to Date object for sorting
 */
function parseFileDate(filename) {
  const match = filename.match(/map_(\d{4})_(\d{2})_(\d{2})\.bin/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(year, month - 1, day);
  }
  return new Date(0);
}

/**
 * Builds map URL from components
 */
function buildMapUrl(year, month, filename) {
  return `${constants.dn42.timeMachineBinUrlPrefix}/${year}/${month}/${filename}`;
}

/**
 * Loads a specific map version
 */
function loadMapVersion(url) {
  window.location.href = `/?data=${encodeURIComponent(url)}`;
}

/**
 * Loads the latest available version
 */
function loadLatestVersion() {
  window.location.href = "/";
}

/**
 * Renders calendar view
 */
function renderCalendarView() {
  if (!versionsData || Object.keys(versionsData).length === 0) {
    return '<div class="map-version-error"><p>No map snapshots available.</p></div>';
  }

  const years = Object.keys(versionsData).sort((a, b) => b.localeCompare(a));
  const currentDate = new Date();

  let html = `
    <div class="calendar-section">
      <div class="calendar-nav">
        <select class="year-select" onchange="window.handleYearChange(this.value)">
          ${years
            .map(
              (year) =>
                `<option value="${year}" ${
                  year == selectedYear ? "selected" : ""
                }>${year}</option>`
            )
            .join("")}
        </select>
      </div>
      <div class="calendar-months">
  `;

  const yearData = versionsData[selectedYear];
  if (yearData) {
    for (let month = 0; month < 12; month++) {
      const monthKey = String(month + 1).padStart(2, "0");
      const monthData = yearData[monthKey];
      const hasData = monthData && monthData.length > 0;

      html += `
        <div class="calendar-month ${hasData ? "has-data" : ""} ${
        month === selectedMonth && selectedYear == currentDate.getFullYear()
          ? "current"
          : ""
      }"
             ${
               hasData
                 ? `onclick="window.showMonthDetails('${selectedYear}', '${monthKey}')"`
                 : ""
             }>
          <div class="month-name">${monthNamesShort[month]}</div>
          <div class="month-count">${hasData ? monthData.length : 0}</div>
        </div>
      `;
    }
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Renders the map versions UI in calendar view
 */
async function renderMapVersions(data) {
  const content = document.getElementById("map-version-content");
  versionsData = data;

  if (!versionsData || Object.keys(versionsData).length === 0) {
    content.innerHTML = `
      <div class="map-version-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <p>No map snapshots available.</p>
        <p>The time machine service may be temporarily unavailable.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = renderCalendarView();
}

/**
 * Shows the map versions popup
 */
async function showMapVersions() {
  try {
    const popup = createMapVersionPopup();
    popup.classList.add("show");

    // Reset content to loading state
    const content = document.getElementById("map-version-content");
    content.innerHTML = `
      <div class="map-version-loading">
        <div class="loading-spinner fetching"></div>
        <div class="loading-text">Loading map snapshots...</div>
      </div>
    `;

    // Fetch versions data
    const data = await getMapVersions();
    await renderMapVersions(data);
  } catch (error) {
    console.error("Error fetching map versions:", error);
    const content = document.getElementById("map-version-content");
    content.innerHTML = `
      <div class="map-version-error">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <p>Failed to load network snapshots: ${error.message}</p>
        <p>The time machine service may be temporarily unavailable.</p>
        <button onclick="window.showMapVersions()" class="retry-btn">Retry</button>
      </div>
    `;
  }
}

/**
 * Helper functions for UI interactions
 */
function handleYearChange(year) {
  selectedYear = parseInt(year);
  renderMapVersions(versionsData);
}

function showMonthDetails(year, month) {
  const monthData = versionsData[year][month];
  if (!monthData) return;

  const monthName = monthNames[parseInt(month) - 1];
  const files = [...monthData].sort((a, b) => {
    const dateA = parseFileDate(a);
    const dateB = parseFileDate(b);
    return dateB - dateA;
  });

  // Update the navigation bar to show back button and month title
  const navElement = document.querySelector(".map-version-nav");
  if (navElement) {
    navElement.innerHTML = `
      <div class="nav-left">
        <button class="back-btn" onclick="window.backToCalendar()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Back
        </button>
      </div>
      <div class="nav-center">
        <h3>${monthName} ${year}</h3>
      </div>
    `;
  }

  let html = `
    <div class="month-details">
      <div class="files-grid">
  `;

  for (const filename of files) {
    const readableDate = formatReadableDate(filename);
    const mapUrl = buildMapUrl(year, month, filename);

    html += `
      <div class="file-card"
           onclick="window.loadMapVersion('${mapUrl}')">
        <div class="file-date">${readableDate}</div>
        <div class="file-name">${filename}</div>
      </div>
    `;
  }

  html += `
      </div>
    </div>
  `;

  document.getElementById("map-version-content").innerHTML = html;
}

function backToCalendar() {
  // Restore the original navigation bar
  const navElement = document.querySelector(".map-version-nav");
  if (navElement) {
    navElement.innerHTML = `
      <div class="nav-left">Loaded: ${currentMapVersion}</div>
      <div class="quick-actions">
        <button class="quick-btn" onclick="window.loadLatestVersion()" aria-label="Load latest version">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
          </svg>
          Go to latest
        </button>
      </div>
    `;
  }

  renderMapVersions(versionsData);
}

/**
 * Closes the map versions popup
 */
function closeMapVersions() {
  if (mapVersionPopup) {
    backToCalendar(); // Reset to default calendar view
    mapVersionPopup.classList.remove("show");
  }
}

// Setup event listeners
function setupEventListeners() {
  // Close popup when clicking outside
  document.addEventListener("click", (event) => {
    if (event.target.id === "map-version-overlay") {
      closeMapVersions();
    }
  });

  // Close popup with Escape key
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      mapVersionPopup &&
      mapVersionPopup.classList.contains("show")
    ) {
      closeMapVersions();
    }
  });
}

const initTimeMachine = () => {
  // Make functions globally available for onclick handlers
  window.showMapVersions = showMapVersions;
  window.closeMapVersions = closeMapVersions;
  window.loadMapVersion = loadMapVersion;
  window.loadLatestVersion = loadLatestVersion;
  window.handleYearChange = handleYearChange;
  window.showMonthDetails = showMonthDetails;
  window.backToCalendar = backToCalendar;

  // Initialize event listeners when module loads
  setupEventListeners();
};

const setCurrentMapVersion = (version) => {
  currentMapVersion = version;
};

// Export functions
export {
  initTimeMachine,
  setCurrentMapVersion,
  showMapVersions,
  closeMapVersions,
  loadMapVersion,
};
