#!/bin/bash

go mod download

export GOOS=linux
export GOARCH=amd64
go build -o mapdn42
