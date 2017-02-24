var bodyParser = require('body-parser'),
	oauthserver = require('oauth2-server'),
	auth = require('./auth');

var config = require('./config/conf.json');


var pdns_config = {
		  adapter: "mysql",
		  host: config.dbHost,
		  database: config.dbName,
		  user: config.dbUsername,
		  password: config.dbPassword,
		  port: config.dbPort,
		  /*connectionLimit: config.dbPoolConnLimit,
		  waitForConnections: false*/
};

var pdns = require('pdns')(pdns_config);

	
exports.configure = function (app) {	
	 
	app.use(bodyParser.urlencoded({ extended: true }));
	 
	app.use(bodyParser.json());
	 
	app.oauth = oauthserver({
	  model: require('./auth'), 
	  //grants: ['password', 'refresh_token'],
	  debug: true,
	  accessTokenLifetime: 36000/*,
	  refreshTokenLifetime: 999999999*/
	});

	app.all('/oauth/token', app.oauth.grant()); 
	
	app.use(app.oauth.errorHandler());
	
	app.get('/domain', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			pdns.domains.list({}, {}, function(err, domains) {
				if(err){
					return res.send({error: err.message});
				}
				return res.send({domains: domains});
			});
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
	
	
	app.post('/domain', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			if(req.body.soa && req.body.ns){
				pdns.domains.add({name:domainname}, {soa:true, ns:true}, function(err, response){
					if(err) {
						return res.send({error: err.message});
			        }
					return res.send({result: "success"});
				});
			} else{
				pdns.domains.add({name:domainname}, {}, function(err, response){
					if(err) {
						return res.send({error: err.message});
			        }
					return res.send({result: "success"});
				});
			}
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
	
	app.del('/domain', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			pdns.domains.remove({name:domainname},{},function(err, response){
				if(err){
					return res.send({error: err.message});
				}
				return res.send({result: "success"});
			});
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
	
	app.get('/record', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			pdns.records.list(domainname, {}, {}, function(err, records) {
				if(err){
					return res.send({error: err.message});
				}
				return res.send({records: records});
			});
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
	
	app.post('/record', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			var record = req.body.record;
			pdns.records.add(domainname, {name: record.name, 
				type: record.type, 
				content: record.content,
				ttl: record.ttl}, 
				{}, function(err, response){
					if(err) {
						return res.send({error: err.message});
			        }
					return res.send({result: "success", recordId: response.insertId.toString()});
			});
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});	
	
	app.put('/record', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			var record = req.body.record;
			pdns.records.edit(domainname, {name: record.name, 
				type: record.type, 
				content: record.content,
				ttl: record.ttl,
				id: req.body.id}, 
				{}, function(err, response){
					if(err) {
						return res.send({error: err.message});
			        }
					return res.send({result: "success", recordId: response.insertId.toString()});
			});
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
	
	app.del('/record', app.oauth.authorise(), function (req, res){
		if(pdns_config.user === req.body.dbUsername && pdns_config.password === req.body.dbPassword){
			var domainname = req.body.domainname;
			var record = req.body.record;
			if(record.name && record.type && record.content){
				pdns.records.remove(domainname, {name:record.name, type:record.type, content:record.content}, {}, function(err, response){
					if(err){
						return res.send({error: err.message});
					}
					return res.send({result: "success"});
				});
			} else {
				pdns.records.list(domainname, {}, {}, function(err, records) {
					if(err){
						return res.send({error: err.message});
					}
					for(var i =0; i< records.length;++i ){
						if(records[i].id.toString() === record.id && records[i].name == record.name){
							pdns.records.remove(domainname, {name:records[i].name, type:records[i].type, content:records[i].content}, {}, function(err, response){
								if(err){
									return res.send({error: err.message});
								}
								return res.send({result: "success"});
							});
						}
					}
				});
			}
		} else {
			return res.send({error: "You don't have authority for this server"});
		}
	});
};
	
