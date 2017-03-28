#stop containers
docker-compose -f compose_manage_server.yml stop

#rm containers
docker-compose -f compose_manage_server.yml rm
