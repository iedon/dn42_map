#!/bin/bash

protoc  -I./ \
--go_out=./ \
./graph.proto \
--plugin=protoc-gen-go.exe
