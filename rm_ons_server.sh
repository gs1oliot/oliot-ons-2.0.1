#stop containers
docker-compose -f compose_ons_server.yml stop

#rm containers
docker-compose -f compose_ons_server.yml rm
