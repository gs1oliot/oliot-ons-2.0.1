#!/bin/bash

/var/lib/neo4j/bin/neo4j start

sleep 20

/var/lib/neo4j/bin/neo4j-shell -file /var/lib/neo4j/import/constraints.cql

/var/lib/neo4j/bin/neo4j stop

/docker-entrypoint.sh neo4j
