#!/bin/bash
set -ex
registry_path="https://${GIT_DN42_TOKEN}@git.dn42.dev/dn42/registry.git"
[ -e registry ] && (cd registry; git pull) || git clone "$registry_path" registry --depth 1 --single-branch
[ -e map.json ] && rm map.json
python3 -m venv v
v/bin/pip install -r requirements.txt
v/bin/python map.py
