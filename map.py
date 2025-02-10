
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
  - Converts IP address/prefix strings into compact numeric representations:
      • IPv4 addresses as a 32-bit integer.
      • IPv6 addresses as byte value.
  - Serializes the result as a Protocol Buffers Graph using an updated proto definition.
  
Make sure to compile message.proto to generate message_pb2.
"""

import os
import logging
import asyncio
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

# Import the generated protobuf module (from message.proto)
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

MASTER4_URL = 'https://mrt.kuu.moe/master4_latest.mrt.bz2'
MASTER6_URL = 'https://mrt.kuu.moe/master6_latest.mrt.bz2'
OUTPUT_PROTO_FILE = './map.pb'

# ------------------------------------------------------------------------------
# Asynchronous Registry Lookup for ASN Descriptions
# ------------------------------------------------------------------------------
async def get_desc_by_asn(asn: int) -> str:
    """
    Retrieve the description for the given ASN from the local registry.
    Falls back to "AS{asn}" if no description is found.
    """
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
    Process MRT data (decompressed from bz2) and extract:
      - as_paths: a list of AS path lists (each a list of int ASNs)
      - advertises: mapping from an ASN (int) to a set of CIDR tuples.
          Each CIDR tuple is (prefix, ip_type, ip_value) where:
            • ip_type is "ipv4" or "ipv6"
            • ip_value is an integer (IPv4) or a 16-byte bytes object (IPv6).
      - metadata: a dict with metadata (if available)
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

                # Determine the MRT subtype.
                subtype = None
                if "subtype" in data and isinstance(data["subtype"], dict):
                    subtype = next(iter(data["subtype"].keys()))

                if subtype == 1:
                    # Metadata entry.
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
                    # For route entries, attempt to parse prefix and prefix length.
                    try:
                        prefix = data["prefix"]
                        length = data["length"]
                    except Exception:
                        continue

                    # Convert the prefix to a numeric representation.
                    try:
                        ip_obj = ipaddress.ip_address(prefix)
                    except Exception:
                        continue

                    if isinstance(ip_obj, ipaddress.IPv4Address):
                        # IPv4: convert to 32-bit integer.
                        cidr_tuple = (length, "ipv4", int(ip_obj))
                    elif isinstance(ip_obj, ipaddress.IPv6Address):
                        # IPv6: convert to 16-byte (128-bit) representation.
                        ipv6_bytes = int(ip_obj).to_bytes(16, byteorder="big")
                        cidr_tuple = (length, "ipv6", ipv6_bytes)
                    else:
                        continue

                    # Process RIB entries to extract AS paths.
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
                                    # Use the last ASN in the AS path as the advertiser.
                                    if by is None:
                                        by = parsed_as_path[-1]
                                    as_paths.append(parsed_as_path)
                    if by is not None:
                        # Store the CIDR tuple in the advertises mapping.
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
                auth=aiohttp.BasicAuth(MRT_BASIC_AUTH_USER, MRT_BASIC_AUTH_PASSWORD),
            ),
            session.get(
                MASTER6_URL,
                ssl=False,
                auth=aiohttp.BasicAuth(MRT_BASIC_AUTH_USER, MRT_BASIC_AUTH_PASSWORD),
            ),
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
            links_set.add((as_path[i], as_path[i + 1]))

    # 4. Retrieve ASN descriptions concurrently.
    logging.info("Fetching ASN descriptions...")
    desc_tasks = {asn: asyncio.create_task(get_desc_by_asn(asn)) for asn in nodes_set}
    node_descriptions = {}
    for asn, task in desc_tasks.items():
        node_descriptions[asn] = await task

    # 5. Build the Graph protobuf message.
    graph = message_pb2.Graph()

    # Set metadata (with defaults if unavailable).
    metadata_msg = message_pb2.Metadata()
    if merged_metadata:
        metadata_msg.vendor = merged_metadata.get("vendor", "IEDON.NET")
        metadata_msg.timestamp = merged_metadata.get("timestamp", 0)
        metadata_msg.time = merged_metadata.get("time", "")
    else:
        metadata_msg.vendor = "IEDON.NET"
        metadata_msg.timestamp = 0
        metadata_msg.time = ""
    graph.metadata.CopyFrom(metadata_msg)

    # Build Node messages with CIDR routes.
    for asn in nodes_set:
        node_msg = graph.nodes.add()
        node_msg.asn = int(asn)
        node_msg.desc = node_descriptions.get(asn, f"AS{asn}")
        for route in merged_advertises.get(asn, set()):
            prefix, ip_type, ip_value = route
            route_msg = node_msg.routes.add()
            route_msg.prefix = prefix
            if ip_type == "ipv4":
                route_msg.ipv4 = ip_value
            elif ip_type == "ipv6":
                route_msg.ipv6 = ip_value

    # Build Link messages.
    for src, dst in links_set:
        link_msg = graph.links.add()
        link_msg.source = int(src)
        link_msg.target = int(dst)

    # 6. Write the Graph (protobuf binary) to file.
    try:
        async with aiofiles.open(OUTPUT_PROTO_FILE, mode="wb") as f:
            await f.write(graph.SerializeToString())
        logging.info("Graph protobuf written to %s", OUTPUT_PROTO_FILE)
    except Exception as e:
        logging.exception("Failed to write graph protobuf: %s", e)

# ------------------------------------------------------------------------------
# Entry Point
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        logging.exception("An error occurred: %s", e)
