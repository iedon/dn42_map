// src/graph/sidebar/sidebarCore.js

let map;
let showingSideBar = false;

export const initSidebar = (m) => {
  map = m;
};

export const getShowingSideBar = () => showingSideBar;

export const setShowingSideBar = (state) => {
  showingSideBar = state;
};

export const getMap = () => map;
