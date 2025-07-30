// src/graph/sidebar/eventListeners.js

import {
  setupSearchEventListener,
  setupSearchButtonListener,
} from "./navigation.js";
import { closeSideBar } from "./sidebarDisplay.js";

export const checkSearchInputEventListener = () => {
  setupSearchEventListener();
};

export const closeSideBarEventListener = () => {
  document
    .getElementById("close-sidebar")
    ?.addEventListener("click", closeSideBar);
};

export const searchNodeEventListener = () => {
  setupSearchButtonListener();
};
