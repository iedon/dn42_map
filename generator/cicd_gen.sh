#!/bin/bash
set -ex
registry_path="https://${GIT_DN42_TOKEN}@git.dn42.dev/dn42/registry.git"
[ -e dn42registry ] && (cd dn42registry; git pull) || git clone "$registry_path" dn42registry --depth 1 --single-branch
[ -e map.bin ] && rm map.bin
go mod download
go build -o mapdn42
cp config.sample.json config.json
./mapdn42