#!/usr/bin/python3
# -*- coding: utf-8 -*-

import asyncio, json
import aiohttp
from aiohttp import web
from aiohttp.client_exceptions import ClientConnectionError
import time
from datetime import datetime, date
import aiofiles
import logging


LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"
DATE_FORMAT = "%m/%d/%Y %H:%M:%S %p"
fs = logging.StreamHandler()
logging.basicConfig(level=logging.WARNING, format=LOG_FORMAT, datefmt=DATE_FORMAT, handlers=[fs])

try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
except ImportError:
    pass


_port = 8125
#_host_asn = 4242422189
_root_directory = "/dev/shm"
_registry = f"{_root_directory}/registry"
_headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST',
    'Access-Control-Max-Age': '3600',
    'Access-Control-Allow-Credentials': 'false',
    'Cache-Control': 'max-age=60'
}
_updateIntervalSeconds = 15 * 60
_asn = []
_links = []


@web.middleware
async def jsonFormat(request, handler):
    if request.method == 'OPTIONS':
        return web.Response(status=200, content_type='application/json', headers=_headers)
    resp = await handler(request)
    if isinstance(resp, str):
        resp_data = resp
    elif isinstance(resp, (dict, list, tuple)):
        resp_data = json.dumps(resp)
    else:
        raise TypeError("Param 'data' must be str, dict, list or tuple")
    return web.Response(body=resp_data, status=200, content_type='application/json', headers=_headers)


app = web.Application(middlewares=[jsonFormat])
router = web.RouteTableDef()


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


async def getWhoisByASN(asn):
    async with aiofiles.open(f"{_registry}/data/aut-num/AS{asn}", mode='r') as f:
        return await f.read()


async def checkAndAddASN(asnArr, asn):
    for _as in asnArr:
        try:
            if _as['asn'] == int(asn):
                return
        except:
            continue
    try:
        asnArr.append({
            'group': 1,
            'asn': int(asn),
            'desc': await getDescByASN(asn)
        })
    except:
        pass


async def checkAndAddLink(asnArr, linkArr, asn1, asn2):
    try:
        asn1_int = int(asn1)
        asn2_int = int(asn2)
    except:
        return
    if asn1_int == asn2_int:
        return
    asn1_index = 0
    asn2_index = 0
    found_asn1 = False
    found_asn2 = False
    asn_len = len(asnArr)
    for i in range(0, asn_len):
        if asnArr[i]['asn'] == asn1_int:
            asn1_index = i
            found_asn1 = True
        if asnArr[i]['asn'] == asn2_int:
            asn2_index = i
            found_asn2 = True
        if found_asn1 and found_asn2:
            break

    if not found_asn1 and not found_asn2:
        return

    for link in linkArr:
        if link['source'] == asn1_index and link['target'] == asn2_index:
            return

    linkArr.append({
        'source': asn1_index,
        'target': asn2_index,
        'value': 1
    })


@router.get("/aspath")
async def aspath(request):
    return {
        'nodes': _asn,
        'links': _links
    }


@router.post("/whois")
async def whois(request):
    body = json.loads(await request.read())
    return {
        'whois': await getWhoisByASN(str(body['asn']))
    }


async def updatePath():
    global _asn
    global _links
    while True:
        try:
            async with aiofiles.open(f"{_root_directory}/aspath.txt", mode='r') as f:
                asn = []
                links = []
                async for line in f:
                    if line.find('BGP.as_path:') == -1:
                        continue
                    _line = line.replace('BGP.as_path:', '').strip()
                    paths = _line.split('\x20')
                    link_count = len(paths) - 1
                    if link_count == 0 and paths[0] == '':
                        continue
                    # paths.insert(0, str(_host_asn))
                    # link_count = link_count + 1
                    for i in range(link_count):
                        await checkAndAddASN(asn, paths[i])
                        await checkAndAddASN(asn, paths[i + 1])
                        await checkAndAddLink(asn, links, paths[i], paths[i + 1])
                if len(asn) != 0 and len(links) != 0:
                    _asn = asn
                    _links = links
        except:
            logging.exception('[WARN] Updating registry data failed.')
        await asyncio.sleep(_updateIntervalSeconds)


if __name__ == "__main__":
    app.add_routes(router)
    loop = asyncio.get_event_loop()
    loop.create_task(updatePath())
    loop.create_task(web._run_app(app, port=_port))
    loop.run_forever()

