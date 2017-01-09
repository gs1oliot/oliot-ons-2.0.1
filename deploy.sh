#!/bin/bash

# populate environment variables
set -a
source .env

# replace variables in conf file
envsubst < ./db-api/conf.template > ./db-api/conf.json
envsubst < ./web-api/conf.template > ./web-api/conf.json
envsubst < ./web-app/conf.template > ./web-app/conf.json

# run
docker-compose -f compose.yml up