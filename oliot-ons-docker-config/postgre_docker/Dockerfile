FROM postgres:9.4

MAINTAINER Kiwoong Kwon <kiwoong@kaist.ac.kr>

COPY postgresql.conf /postgresql.conf

ADD set-config.sh /docekr-entrypoint-initdb.d/set-config.sh

ADD schema.sql /docker-entrypoint-initdb.d/schema.sql
