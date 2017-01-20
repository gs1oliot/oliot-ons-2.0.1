#stop containers
docker stop powerdns db_api backend_mysql

#remove containers
docker rm powerdns db_api backend_mysql 

#remove images
docker rmi oliotons11_db_api mysql:5.5 sath89/pdns-mysql

