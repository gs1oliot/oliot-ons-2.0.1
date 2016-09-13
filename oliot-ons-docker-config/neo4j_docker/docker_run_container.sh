docker run -d --name=acl_neo4j  --publish=7474:7474 --publish=7687:7687 --publish=7473:7473 --volume=$project_folder(modify this)/data:/data --env=NEO4J_dbms_memory_pagecache_size=5G --env=NEO4J_dbms_memory_heap_maxSize=5000 neo4j:3.0

