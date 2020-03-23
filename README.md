## oliot-ons-1.1
Oliot-ons is the impementation of [GS1 ONS 2.0.1](http://www.gs1.org/sites/default/files/docs/epc/ons_2_0_1-standard-20130131.pdf)

## Features
* Node.js based RESTful Interface for easy service records management
* Access control to share accesibitity to service records with others
* Oauth 2.0 compliant authentification 

## Install
### Prerequisites
Get [docker](https://docs.docker.com/engine/installation/linux/ubuntu/) and [docker-compose](https://docs.docker.com/compose/install/)
### Before installation
configure each DB's ID and PW in .env file for your purpose.
### Linux
You can install ONS management server comprised of authentification(postgreSQL), access control(Neo4J), web app(Node.js), web API(Node.js).
```shell
$ bash deploy_manage_server.sh
```
You can install ONS server comprised of ONS compliant DNS software(powerDNS), back-end DB(MySQL), web API(Node.js).
```shell
$ bash deploy_ons_server.sh 
```
### Notice
* You can install both servers in one machine.
* If the data in the mysql table is displayed as an unknown string as shown below, add the following command.
```shell
+----+---------+
| id | content |
+----+---------+
|  1 |   ???   |
|  2 |   ???   |
+----+---------+

# Connect mysql docker
# vi etc/mysql/my.cnf

[client]
default-character-set=utf8

[mysqld]
collation-server = utf8_unicode_ci
init-connect='SET NAMES utf8'
character-set-server = utf8
```
## License
See [LICENSE](LICENSE).
