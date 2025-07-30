// src/data.js

import { constants } from "../constants";
import { parse } from "protobufjs";

/**
 * Fetches graph data from the server.
 */
export async function getGraphData(url) {
  const response = await fetch(url || "map.bin");

  if (!response.ok) throw new Error("Failed to fetch graph data.");

  // Minified from ~/generator/message.proto
  const proto = 'syntax="proto3";package dn42_map;message Node{uint32 asn=1;string desc=2;repeated Route routes=3;Centrality centrality=4;}message Centrality{double degree=1;double betweenness=2;double closeness=3;uint32 index=4;uint32 ranking=5;}message Route{uint32 length=1;oneof ip{uint32 ipv4=2;IPv6 ipv6=3;}}message IPv6{uint32 high_h32=1;uint32 high_l32=2;uint32 low_h32=3;uint32 low_l32=4;}message Link{uint32 source=1;uint32 target=2;}message Metadata{string vendor=1;uint64 generated_timestamp=2;uint64 data_timestamp=3;}message Graph{Metadata metadata=1;repeated Node nodes=2;repeated Link links=3;}';
  const dn42Map = parse(proto, { keepCase: true }).root.lookupType("dn42_map.Graph");
  const data = dn42Map.toObject(dn42Map.decode(new Uint8Array(await response.arrayBuffer())));

  if (data.metadata.vendor !== constants.binVendorMagic) {
    throw new Error("Invalid response or map provider.");
  }

  return data;
}

/**
 * Fetches whois data from the server.
 */
export async function getWhoisData(asn) {
  const response = await fetch(`${constants.dn42.whoisApi}${asn}`, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error("Network status code error.");
  }

  const data = await response.json();
  if (!data.whois) {
    throw new Error("Network response error.");
  }
  return data.whois;
}

/**
 * Fetches source ip data from the server.
 */
export async function getMyIpData() {
  const response = await fetch(constants.dn42.myIpApi, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  if (!response.ok) throw new Error("Failed to fetch myip data.");

  const data = await response.json();
  if (!data.ip) {
    throw new Error("Network response error.");
  }
  return data;
}

/**
 * Fetches available map versions from the server.
 */
export async function getMapVersions() {
  const response = await fetch(`${constants.dn42.timeMachineBinUrlPrefix}/index.json`, {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  if (!response.ok) throw new Error("Failed to fetch map versions.");

  const data = await response.json();
  return data;
}
