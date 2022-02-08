#!/usr/bin/python3
# -*- coding: utf-8 -*-

import json, logging
import asyncio, aiohttp, aiofiles, bz2, mrtparse
from io import BytesIO


LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%m/%d/%Y %H:%M:%S %p"
fs = logging.StreamHandler()
logging.basicConfig(level=logging.WARNING, format=LOG_FORMAT, datefmt=DATE_FORMAT, handlers=[fs])


_registry = './registry'


_asnIndexDict = dict()
_linksCheckDict = dict()

_metadata = dict()
_advertises = dict()


async def getDescByASN(asn):
    try:
        async with aiofiles.open(f"{_registry}/data/aut-num/AS{asn}", mode='r') as f:
            admin_c = ''
            mntr = ''
            as_name = ''
            descr = ''
            async for line in f:
                _line = line.strip()
                kv = _line.split('admin-c:')
                if len(kv) == 2:
                    admin_c = kv[1].strip()
                    continue
                kv = _line.split('mnt-by:')
                if len(kv) == 2:
                    mntr = kv[1].strip()
                    continue
                kv = _line.split('as-name:')
                if len(kv) == 2:
                    as_name = kv[1].strip()
                    continue
                kv = _line.split('descr:')
                if len(kv) == 2:
                    descr = kv[1].strip()
                    continue
            if admin_c == mntr:
                return mntr
            elif admin_c != '':
                return admin_c
            elif admin_c == '' and as_name != '':
                return as_name
            elif admin_c == '' and as_name == '' and descr != '':
                return descr
            else:
                return mntr
    except:
        pass
    return f"AS{asn}"


async def checkAndAddASN(asnArr, asn):
    if asn in _asnIndexDict:
        return
    try:
        routes = _advertises[asn] if asn in _advertises else []
        asnArr.append({
            'group': 1,
            'asn': int(asn),
            'routes': routes,
            'desc': await getDescByASN(asn)
        })
        _asnIndexDict[asn] = len(asnArr) - 1
    except:
        pass


async def checkAndAddLink(linkArr, asn1, asn2):
    if asn1 not in _asnIndexDict or asn2 not in _asnIndexDict:
        return

    if asn1 + '-' + asn2 in _linksCheckDict:
        return

    asn1_index = _asnIndexDict[asn1]
    asn2_index = _asnIndexDict[asn2]

    linkArr.append({
        'source': asn1_index,
        'target': asn2_index,
        'value': 1
    })
    _linksCheckDict[asn1 + '-' + asn2] = 0


def process_entry(entry: mrtparse.Reader) -> dict:
    global _metadata
    if getattr(entry, 'err', None) is not None:
        logging.exception("{entry.err=} {entry.err_msg=} {entry.buf=}")
        return None
    entry = entry.data
    subtype = entry.get('subtype', [None, "None"])[0]
    if subtype == 1:
        _metadata = {
            'timestamp': entry['timestamp'][0],
            'time': entry['timestamp'][1],
        }
        return None
    elif subtype in {2, 8, 4, 10}:
        cidr = f"{entry['prefix']}/{entry['prefix_length']}"
        by = ''
        rib = list()
        for rib_entry in entry['rib_entries']:
            rib_attr = dict()
            rib.append(rib_attr)
            for attr in rib_entry['path_attributes']:
                attr_type = attr['type'][0]
                if attr_type == 2:
                    parsed_as_path = list()
                    for as_sequence in attr['value']:
                        assert as_sequence['type'][0] == 2
                        parsed_as_path.extend(as_sequence['value'])
                    rib_attr['as_path'] = parsed_as_path
                    if by == '':
                        by = rib_attr['as_path'][len(rib_attr['as_path']) - 1]
                elif attr_type == 8:
                    #rib_attr['community'] = attr['value']
                    pass
                elif attr_type == 16:
                    #rib_attr['extended_community'] = attr['value']
                    pass
                elif attr_type == 32:
                    #rib_attr['large_community'] = attr['value']
                    pass
                elif attr_type in {1, 3, 4, 5, 6, 7, 14}:
                    pass
                else:
                    # print(f"unknown {attr_type=} {attr['type'][1]}")
                    pass
            rib.append(rib_attr)
        if by != '':
            if by in _advertises:
                if cidr not in _advertises[by]:
                    _advertises[by].append(cidr)
            else:
                _advertises[by] = list()
                _advertises[by].append(cidr)
        return {
            "prefix": cidr,
            "by": by,
            "rib": rib,
        }
    else:
        # print(f"unknown {subtype=}")
        return None


async def process_mrt(mrtFile, asnArr, linksArr):
    for entry in mrtparse.Reader(mrtFile):
        try:
            assert getattr(entry, 'err', None) is None
            processed = process_entry(entry)
            if processed != None:
                for record in processed['rib']:
                    path_len = len(record['as_path']) - 1
                    for i in range(path_len):
                        await checkAndAddASN(asnArr, record['as_path'][i])
                        await checkAndAddASN(asnArr, record['as_path'][i + 1])
                        await checkAndAddLink(linksArr, record['as_path'][i], record['as_path'][i + 1])
        except:
            pass


async def gen():
    global _asnIndexDict
    global _linksCheckDict
    global _metadata
    global _advertises

    asn = []
    links = []
    _asnIndexDict = dict()
    _linksCheckDict = dict()
    _metadata = dict()
    _advertises = dict()

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://mrt.kuu.moe/master4_latest.mrt.bz2', ssl=False) as resp:
                master4 = await resp.read()
                await process_mrt(bz2.BZ2File(BytesIO(master4), 'rb'), asn, links)

            async with session.get('https://mrt.kuu.moe/master6_latest.mrt.bz2', ssl=False) as resp:
                master6 = await resp.read()
                await process_mrt(bz2.BZ2File(BytesIO(master6), 'rb'), asn, links)

            async with aiofiles.open('./map.json', mode='w+') as f:
                return await f.write(json.dumps({
                    'metadata': _metadata,
                    'nodes': asn,
                    'links': links
                }))
    except:
        logging.exception('[WARN] Failed to generate map.')


if __name__ == "__main__":
    try:
        import uvloop
        asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    except ImportError:
        pass
    loop = asyncio.get_event_loop_policy().get_event_loop()
    loop.run_until_complete(gen())
