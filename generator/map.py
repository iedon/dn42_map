#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
    *****************************
        DN42 Map Generator
        IEDON-NET
        2025
    *****************************
  - Concurrently fetches MRT files via aiohttp.
  - Uses ProcessPoolExecutor to offload heavy MRT parsing across CPU cores.
  - Converts IP addresses into compact numeric representations:
      • IPv4 addresses as a 32-bit integer.
      • IPv6 addresses are split into four 32-bit unsigned integers:
          - high_h32, high_l32, low_h32, low_l32.
  - Serializes the result as a Protocol Buffers Graph using the updated proto definition.
  - For Link messages, the source and target fields store the node's index in the node array.

Make sure to compile message.proto (e.g., via protoc) to generate message_pb2.
"""

import os
import logging
import asyncio
import time
import aiohttp
import aiofiles
import bz2
import mrtparse
import concurrent.futures
import ipaddress
from io import BytesIO

try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ImportError:
    pass

# Import the generated protobuf module.
import message_pb2

# ------------------------------------------------------------------------------
# Configuration
# ------------------------------------------------------------------------------
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%m/%d/%Y %H:%M:%S %p"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, datefmt=DATE_FORMAT)

REGISTRY_PATH = "./registry"
MRT_BASIC_AUTH_USER = os.environ.get('MRT_BASIC_AUTH_USER')
MRT_BASIC_AUTH_PASSWORD = os.environ.get('MRT_BASIC_AUTH_PASSWORD')

MASTER4_URL = 'https://mrt.iedon.net/master4_latest.mrt.bz2'
MASTER6_URL = 'https://mrt.iedon.net/master6_latest.mrt.bz2'
OUTPUT_PROTO_FILE = './map.bin'

# ------------------------------------------------------------------------------
# Asynchronous Registry Lookup for ASN Descriptions
# ------------------------------------------------------------------------------
async def get_desc_by_asn(asn: int) -> str:
    file_path = os.path.join(REGISTRY_PATH, 'data', 'aut-num', f"AS{asn}")
    try:
        async with aiofiles.open(file_path, mode='r') as f:
            admin_c = ""
            mntr = ""
            as_name = ""
            descr = ""
            async for line in f:
                line = line.strip()
                if "admin-c:" in line:
                    parts = line.split("admin-c:")
                    if len(parts) > 1:
                        admin_c = parts[1].strip()
                    continue
                if "mnt-by:" in line:
                    parts = line.split("mnt-by:")
                    if len(parts) > 1:
                        mntr = parts[1].strip()
                    continue
                if "as-name:" in line:
                    parts = line.split("as-name:")
                    if len(parts) > 1:
                        as_name = parts[1].strip()
                    continue
                if "descr:" in line:
                    parts = line.split("descr:")
                    if len(parts) > 1:
                        descr = parts[1].strip()
                    continue
            if admin_c and (admin_c == mntr):
                return admin_c
            elif admin_c:
                return admin_c
            elif as_name:
                return as_name
            elif descr:
                return descr
            else:
                return f"AS{asn}"
    except Exception as e:
        logging.warning("Failed to get description for ASN %s: %s", asn, e)
        return f"AS{asn}"

# ------------------------------------------------------------------------------
# Synchronous MRT Processing in a Worker Process
# ------------------------------------------------------------------------------
def process_mrt_sync(mrt_bytes: bytes) -> dict:
    """
    Process MRT data (bz2 compressed) and extract:
      - as_paths: a list of AS path lists (each a list of int ASNs).
      - advertises: mapping from an ASN (int) to a set of CIDR tuples.
          Each CIDR tuple is (length, ip_type, ip_value) where:
            • ip_type is "ipv4" or "ipv6".
            • For "ipv4", ip_value is a 32-bit integer.
            • For "ipv6", ip_value is a tuple of four 32-bit integers:
                  (high_h32, high_l32, low_h32, low_l32).
      - metadata: a dictionary with metadata (if available).
    """
    as_paths = []
    advertises = {}
    metadata = None

    try:
        with bz2.BZ2File(BytesIO(mrt_bytes), 'rb') as f:
            for entry in mrtparse.Reader(f):
                if getattr(entry, "err", None) is not None:
                    continue
                data = entry.data
                subtype = None
                if "subtype" in data and isinstance(data["subtype"], dict):
                    subtype = next(iter(data["subtype"].keys()))
                if subtype == 1:
                    if metadata is None and "timestamp" in data:
                        try:
                            ts_key = next(iter(data["timestamp"].keys()))
                            ts_val = next(iter(data["timestamp"].values()))
                            metadata = {
                                "vendor": "IEDON.NET",
                                "timestamp": int(ts_key),
                                "time": ts_val,
                            }
                        except Exception:
                            metadata = None
                    continue
                elif subtype in {2, 4, 8, 10}:
                    try:
                        prefix = data["prefix"]
                        length = data["length"]
                    except Exception:
                        continue

                    try:
                        ip_obj = ipaddress.ip_address(prefix)
                    except Exception:
                        continue

                    if isinstance(ip_obj, ipaddress.IPv4Address):
                        cidr_tuple = (length, "ipv4", int(ip_obj))
                    elif isinstance(ip_obj, ipaddress.IPv6Address):
                        ipv6_int = int(ip_obj)
                        # Get the high and low 64-bit halves.
                        high64 = ipv6_int >> 64
                        low64 = ipv6_int & ((1 << 64) - 1)
                        # Now split each 64-bit half into two 32-bit parts.
                        high_h32 = high64 >> 32
                        high_l32  = high64 & ((1 << 32) - 1)
                        low_h32  = low64 >> 32
                        low_l32   = low64 & ((1 << 32) - 1)
                        cidr_tuple = (length, "ipv6", (high_h32, high_l32, low_h32, low_l32))
                    else:
                        continue

                    by = None
                    for rib_entry in data.get("rib_entries", []):
                        for attr in rib_entry.get("path_attributes", []):
                            attr_type = None
                            if isinstance(attr.get("type"), dict):
                                attr_type = next(iter(attr["type"].keys()))
                            if attr_type == 2:  # AS_PATH attribute.
                                parsed_as_path = []
                                for as_sequence in attr.get("value", []):
                                    seq_type = None
                                    if isinstance(as_sequence.get("type"), dict):
                                        seq_type = next(iter(as_sequence["type"].keys()))
                                    if seq_type == 2:
                                        parsed_as_path.extend(as_sequence.get("value", []))
                                if parsed_as_path:
                                    if by is None:
                                        by = parsed_as_path[-1]
                                    as_paths.append(parsed_as_path)
                    if by is not None:
                        advertises.setdefault(by, set()).add(cidr_tuple)
                else:
                    continue
    except Exception as e:
        logging.exception("Error processing MRT data: %s", e)
    return {"as_paths": as_paths, "advertises": advertises, "metadata": metadata}

# ------------------------------------------------------------------------------
# Main Asynchronous Routine
# ------------------------------------------------------------------------------
async def main():
    loop = asyncio.get_running_loop()

    # 1. Fetch MRT files concurrently.
    logging.info("Fetching MRT files...")
    async with aiohttp.ClientSession() as session:
        fetch_tasks = [
            session.get(
                MASTER4_URL,
                ssl=False,
                auth=aiohttp.BasicAuth(MRT_BASIC_AUTH_USER, MRT_BASIC_AUTH_PASSWORD)
            ),
            session.get(
                MASTER6_URL,
                ssl=False,
                auth=aiohttp.BasicAuth(MRT_BASIC_AUTH_USER, MRT_BASIC_AUTH_PASSWORD)
            )
        ]
        responses = await asyncio.gather(*fetch_tasks)
        mrt_bytes_list = []
        for resp in responses:
            mrt_bytes = await resp.read()
            mrt_bytes_list.append(mrt_bytes)
            resp.release()

    # 2. Process MRT files in parallel using ProcessPoolExecutor.
    logging.info("Processing MRT files...")
    with concurrent.futures.ProcessPoolExecutor() as executor:
        process_tasks = [
            loop.run_in_executor(executor, process_mrt_sync, mrt_bytes)
            for mrt_bytes in mrt_bytes_list
        ]
        results = await asyncio.gather(*process_tasks)

    # Merge results from both MRT files.
    merged_as_paths = []
    merged_advertises = {}
    merged_metadata = None
    for result in results:
        if len(result.get("as_paths", [])) == 0:
            raise "Empty result set."
        merged_as_paths.extend(result.get("as_paths", []))
        advertises = result.get("advertises", {})
        for asn, routes in advertises.items():
            if asn in merged_advertises:
                merged_advertises[asn].update(routes)
            else:
                merged_advertises[asn] = set(routes)
        if not merged_metadata and result.get("metadata"):
            merged_metadata = result.get("metadata")

    # 3. Build nodes and links from AS paths.
    nodes_set = set()
    links_set = set()
    for as_path in merged_as_paths:
        if len(as_path) < 2:
            continue
        nodes_set.update(as_path)
        for i in range(len(as_path) - 1):
            links_set.add((as_path[i], as_path[i+1]))

    # 4. Retrieve ASN descriptions concurrently.
    logging.info("Fetching ASN descriptions...")
    desc_tasks = {asn: asyncio.create_task(get_desc_by_asn(asn)) for asn in nodes_set}
    node_descriptions = {}
    for asn, task in desc_tasks.items():
        node_descriptions[asn] = await task

    # 5. Build the Graph protobuf message.
    graph = message_pb2.Graph()
    metadata_msg = message_pb2.Metadata()
    if merged_metadata:
        metadata_msg.vendor = merged_metadata.get("vendor", "IEDON.NET")
        metadata_msg.generated_timestamp = int(time.time())
        metadata_msg.data_timestamp = merged_metadata.get("timestamp", 0)
    else:
        metadata_msg.vendor = "IEDON.NET"
        metadata_msg.generated_timestamp = int(time.time())
        metadata_msg.data_timestamp = 0
    graph.metadata.CopyFrom(metadata_msg)

    # Create a sorted node list and map ASN to node index.
    node_list = sorted(nodes_set)
    asn_to_index = {asn: idx for idx, asn in enumerate(node_list)}

    # Build Node messages.
    for asn in node_list:
        node_msg = graph.nodes.add()
        node_msg.asn = int(asn)
        node_msg.desc = node_descriptions.get(asn, f"AS{asn}")
        for route in merged_advertises.get(asn, set()):
            length, ip_type, ip_value = route
            route_msg = node_msg.routes.add()
            route_msg.length = length
            if ip_type == "ipv4":
                route_msg.ipv4 = ip_value
            elif ip_type == "ipv6":
                # ip_value is a tuple: (high_h32, high_l32, low_h32, low_l32)
                high_h32, high_l32, low_h32, low_l32 = ip_value
                route_msg.ipv6.high_h32 = high_h32
                route_msg.ipv6.high_l32  = high_l32
                route_msg.ipv6.low_h32  = low_h32
                route_msg.ipv6.low_l32   = low_l32

    # Build Link messages using node index mapping.
    for src, dst in links_set:
        if src in asn_to_index and dst in asn_to_index:
            link_msg = graph.links.add()
            link_msg.source = asn_to_index[src]
            link_msg.target = asn_to_index[dst]

    # 6. Write the Graph protobuf to file.
    try:
        async with aiofiles.open(OUTPUT_PROTO_FILE, mode="wb") as f:
            await f.write(graph.SerializeToString())
        logging.info("Graph protobuf written to %s", OUTPUT_PROTO_FILE)
    except Exception as e:
        logging.exception("Failed to write graph protobuf: %s", e)
        exit(1)

# ------------------------------------------------------------------------------
# Entry Point
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        logging.exception("An error occurred: %s", e)
        exit(1)
