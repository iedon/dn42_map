// src/graph/sidebar/tableUtils.js

import { debounce } from "../../utils/ctrlUtil.js";

// Create search input with styling
export const createSearchInput = (placeholder, onInput) => {
  return `
    <div class="table-search-container">
      <input type="text" 
             id="table-search" 
             placeholder="${placeholder}" 
             oninput="${onInput}">
    </div>
  `;
};

// Filter table rows based on search query
export const filterTableRows = (query, tableSelector, searchColumns = []) => {
  const table = document.querySelector(tableSelector);
  if (!table) return;

  const tbody = table.querySelector("tbody");
  const rows = tbody.querySelectorAll("tr");
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    // Show all rows if search is empty
    rows.forEach((row) => (row.style.display = ""));
    return;
  }

  rows.forEach((row) => {
    let shouldShow = false;

    // Search in specified columns or all columns if none specified
    const cellsToSearch =
      searchColumns.length > 0
        ? searchColumns.map((index) => row.cells[index]).filter((cell) => cell)
        : Array.from(row.cells);

    for (const cell of cellsToSearch) {
      const cellText = cell.textContent.toLowerCase();
      if (cellText.includes(searchTerm)) {
        shouldShow = true;
        break;
      }
    }

    row.style.display = shouldShow ? "" : "none";
  });
};

// Debounced search functions
export const debouncedRankingSearch = debounce((query) => {
  filterTableRows(query, ".ranking-table", [1, 2]); // Search ASN and Name columns
}, 150);

export const debouncedNeighborsSearch = debounce((query) => {
  filterTableRows(query, ".neighbors-table", [0, 1]); // Search ASN and Name columns
}, 150);

// Table sorting functionality
let currentSortColumn = -1;
let sortAsc = true;

export const sortTableByColumn = (colIndex, colType = "string") => {
  const thead = document.querySelector("table.sortable thead");
  const tbody = document.querySelector("table.sortable tbody");
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const headers = thead.querySelectorAll("th");

  // Remove previous sort indicators
  headers.forEach((th) => th.classList.remove("sort-asc", "sort-desc"));

  // Toggle direction if same column; otherwise reset
  if (currentSortColumn === colIndex) {
    sortAsc = !sortAsc;
  } else {
    currentSortColumn = colIndex;
    sortAsc = true;
  }

  // Add new sort class
  headers[colIndex].classList.add(sortAsc ? "sort-asc" : "sort-desc");

  // Sort rows
  rows.sort((a, b) => {
    const aText = a.cells[colIndex].textContent.trim();
    const bText = b.cells[colIndex].textContent.trim();

    if (colType === "number") {
      return (Number(aText) - Number(bText)) * (sortAsc ? 1 : -1);
    }

    return aText.localeCompare(bText) * (sortAsc ? 1 : -1);
  });

  // Re-append sorted rows
  rows.forEach((row) => tbody.appendChild(row));
};

export const resetSortState = () => {
  currentSortColumn = -1;
};
