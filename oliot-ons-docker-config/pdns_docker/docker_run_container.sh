docker run -d --name powerdns -e MYSQL_HOST=(your_mysql_public_address) -e MYSQL_DBNAME=powerdns -e MYSQL_DBUSER=poweruser -e MYSQL_DBPASS=password -p 53:53/tcp -p 53:53/udp sath89/pdns-mysql
