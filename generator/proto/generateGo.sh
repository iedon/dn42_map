#!/bin/bash

protoc  -I./ \
--go_out=./ \
./graph.proto \
--plugin=/Users/iedon/Downloads/protoc-29.3-osx-aarch_64/bin/protoc-gen-go
