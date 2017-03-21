#!/bin/bash

# populate environment variables
set -a
source .env

# replace variables in conf file
envsubst < ./db-api/conf.template > ./db-api/conf.json

# run
docker-compose -f compose_ons_server.yml up -d
