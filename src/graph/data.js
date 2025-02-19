// src/data.js

import { constants } from "../constants";
import { parse } from "protobufjs";

/**
 * Fetches graph data from the server.
 */
export async function getGraphData() {
  const response = await fetch("map.bin", {
    headers: {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    }
  });

  if (!response.ok) throw new Error("Failed to fetch graph data.");

  // Minified from ~/generator/message.proto
  const proto = 'syntax="proto3";package dn42graph;message Metadata{string vendor=1;int64 generated_timestamp=2;int64 data_timestamp=3;}message IPv6{uint32 high_h32=1;uint32 high_l32=2;uint32 low_h32=3;uint32 low_l32=4;}message CIDR{uint32 length=1;oneof ip{uint32 ipv4=2;IPv6 ipv6=3;}}message Node{uint32 asn=1;string desc=2;repeated CIDR routes=3;}message Link{uint32 source=1;uint32 target=2;}message Graph{Metadata metadata=1;repeated Node nodes=2;repeated Link links=3;}';
  const dn42Graph = parse(proto, { keepCase: true }).root.lookupType("dn42graph.Graph");
  const data = dn42Graph.toObject(dn42Graph.decode(new Uint8Array(await response.arrayBuffer())));

  if (data.metadata.vendor !== constants.binVendorMagic) {
    throw new Error("Invalid response or map provider.");
  }

  return data;
}

/**
 * Fetches whois data from the server.
 */
export async function getWhoisData(asn) {
  const response = await fetch(constants.dn42.whoisApi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ asn })
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
