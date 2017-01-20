#stop containers
docker stop web_api web-app auth_postgre acl_neo4j

#remove containers
docker rm web_api web-app auth_postgre acl_neo4j

#remove images
docker rmi oliotons11_web_app oliotons11_web_api neo4j:3.0 postgres:9.4
