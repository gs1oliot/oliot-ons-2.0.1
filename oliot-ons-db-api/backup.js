var config = require('./config/conf.json');

var fs = require('fs');

var rimraf = require('rimraf');


var pdns_config = {
		  adapter: "mysql",
		  host: config.dbHost,
		  database: "powerdns",
		  user: config.dbUsername,
		  password: config.dbPassword,
		  port: config.dbPort
	};


module.exports.backup_records = function (callback) {

	var pdns = require('pdns')(pdns_config);
	
	pdns.domains.list({}, {}, function(err, domains) {
		if(err){
			return callback(err);
		}
		rimraf.sync(__dirname+'/records_backup');
		fs.mkdir('./records_backup', function(err){
			if(err){
				return callback(err);
			}
			var domainlist=[];
			for(var i = 0; i< domains.length; ++i){
				var domainInfo = {};
				domainInfo.domain_id = domains[i].id;
				domainInfo.domainname= domains[i].name;
				domainlist.push(domainInfo);
				fs.writeFile('./records_backup/'+domains[i].name, '', function(err) {
					if(err) {
						return callback(err);
					}
				});
			}
			for(i = 0; i< domains.length; ++i){
				pdns.records.list(domains[i].name, {}, {}, function(err, records) {
					if(err){
						return callback(err);
					}
					var strRecords = '';
					if(records.length){
						for(var j = 0 ; j< records.length; ++j){
							strRecords+=records[j].name + ' IN '+records[j].ttl +' '+records[j].type+' '+ records[j].content + '\n';
						}
						var domainfn;
						for(j = 0; j< domains.length; ++j){
							if(records[0].domain_id === domainlist[j].domain_id){
								domainfn = domainlist[j].domainname;
								j = domains.length;
							}
						}
						fs.writeFile('./records_backup/'+domainfn, strRecords, function(err) {
							if(err) {
								return callback(err);
							}
						});
					}
				});
			}
			
		});
	});
};