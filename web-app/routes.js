var 	auth = require('./auth');
var		rest = require('./rest');
var		config = require('./config/conf.json');
var		ons_api_address = config.ONS_API_ADDRESS;
var 	company = null;

exports.configure = function (app) {	
	app.get('/css/', function (req, res) {
		res.contentType('text/css');
		res.sendfile(__dirname + '/css/ObjectNameService.css');
	});

	app.get('/addEmployee', auth.ensureAuthenticated, function(req, res){
		rest.getOperation(ons_api_address, "company/"+req.user.email+"/administorAndOthers", null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('server_list.jade', { user: req.user, others: [], error: error });
			}
			res.render('addEmployee.jade', { user: req.user,  others: response.others, error: error });
		});
	});


	app.post('/addEmployee', auth.ensureAuthenticated, function(req, res){
		var othername = req.body.othername;
		var args = "{\"username\":\""+othername+"\"}";
		
		rest.postOperation(ons_api_address, "company/"+req.user.email+"/employeeOf", null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('addEmployee.jade', { user: req.user, others: null,  error: error });
			} else {
				res.redirect('/');
			}
		});
	});

	app.get('/addRequest', auth.ensureAuthenticated, function(req, res){
		rest.getOperation(ons_api_address, "company/"+req.user.email+"/administorAndOthers", null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('server_list.jade', { user: req.user, requests: [], error: error });
			}
			res.render('addRequest.jade', { user: req.user,  requests: response.requests, error: error });
		});
	});


	app.post('/addRequest', auth.ensureAuthenticated, function(req, res){
		var requestername = req.body.requestername;
		var args = "{\"username\":\""+requestername+"\"}";
		
		rest.postOperation(ons_api_address, "company/"+req.user.email+"/onsAdministratorOf", null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('addRequest.jade', { user: req.user, requests: [],  error: error });
			} else {
				res.redirect('/');
			}
		});
	});
	

	app.get('/addAdministrator', auth.ensureAuthenticated, function(req, res){
		rest.getOperation(ons_api_address, "company/"+req.user.email+"/administorAndOthers", null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('server_list.jade', { user: req.user, employees: [], error: error });
			}
			res.render('addAdministrator.jade', { user: req.user,  employees: response.employees, error: error });
		});
	});


	app.post('/addAdministrator', auth.ensureAuthenticated, function(req, res){
		var employeename = req.body.employeename;
		var args = "{\"username\":\""+employeename+"\"}";
		
		rest.postOperation(ons_api_address, "company/"+req.user.email+"/onsAdministratorOf", null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('addAdministrator.jade', { user: req.user, employees: [],  error: error });
			} else {
				res.redirect('/');
			}
		});
	});


	app.get('/addServer', auth.ensureAuthenticated, function(req, res){
		res.render('addServer.jade', { user: req.user, error: null });
	});
	

	app.post('/addServer', auth.ensureAuthenticated, function(req, res){
		var servername = req.body.servername;
		var serverport = req.body.serverport;
		var dbName = req.body.dbName;
		var dbUsername = req.body.dbUsername;
		var dbPassword = req.body.dbPassword;
		var args = "{\"servername\":\""+servername+"\", \"serverport\":\""+serverport+"\", \"dbName\":\""+dbName+"\", \"dbUsername\":\""+dbUsername+"\", \"dbPassword\":\""+dbPassword+"\"}";
		
		rest.postOperation(ons_api_address, "company/"+req.user.email+"/manage", null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('addServer.jade', { user: req.user,  error: error });
			} else {
				res.redirect('/');
			}
		});
	});
	

	app.get('/delserver/:servername', auth.ensureAuthenticated, function(req, res){
		var uri;
		var servername = req.params.servername;
	
		var args = "{\"servername\":\""+servername+"\"}";
	
		if(company){
			uri = 'company/'+req.user.email+'/unManage';
		} else {
			uri = 'user/'+req.user.email+'/unManage';
		}
		rest.delOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if(error){
				return res.render('server_list.jade', { user: req.user, companies: [], error: error });
			} else {
				res.redirect('/');
			}
		});
	});
	

	app.get('/requestCompany', auth.ensureAuthenticated, function(req, res){
		rest.getOperation(ons_api_address, "allCompanies", null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('server_list.jade', { user: req.user, companies: [], error: error });
			}
			res.render('requestCompany.jade', { user: req.user, companies: response.companies, error: error });
		});
	});


	app.post('/requestCompany', auth.ensureAuthenticated, function(req, res){
		var companyname = req.body.companyname;
		var args = "{\"companyname\":\""+companyname+"\"}";
		
		rest.postOperation(ons_api_address, "user/"+req.user.email+"/request", null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('requestCompany.jade', { user: req.user, companies: [], error: error });
			} else {
				res.redirect('/');
			}
		});
	});

	app.get('/server/:servername', auth.ensureAuthenticated, function(req, res){
		var uri;
		if(company){
			uri = 'company/'+req.user.email+'/server/'+req.params.servername+'/map';
		} else {
			uri = 'user/'+req.user.email+'/server/'+req.params.servername+'/map';
		}
		
		rest.getOperation(ons_api_address, uri, null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('domains.jade', { user: req.user, server: req.params.servername, domains: [], ownner: 'no', error: error });
			}
			res.render('domains.jade', { user: req.user, server: req.params.servername, domains: response.domains, owner: response.owner, error: error });
		});
	});	


	
	
	app.get('/server/:servername/addDomain', auth.ensureAuthenticated, function(req, res){
		res.render('addDomain.jade', { user: req.user, server: req.params.servername, error: null });
	});

	app.post('/server/:servername/addDomain', auth.ensureAuthenticated, function(req, res){
		var domainname = req.body.domainname;
		var servername = req.params.servername;
		var args = "{\"domainname\":\""+domainname+"\"}";
		
		var uri;
		
		if(company){
			uri = 'company/'+req.user.email+'/server/'+servername+'/map';
		} else {
			uri = 'user/'+req.user.email+'/server/'+servername+'/map';
		}
		
		rest.postOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if (error) {
				res.render('addDomain.jade', { user: req.user, server: servername, error: error });
			} else {
				res.redirect('/server/'+servername);
			}
		});
	});
	
	
	app.get('/server/:servername/domain/:domainname/delete', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		
		var args = "{\"domainname\":\""+domainname+"\"}";
		
		if(company){
			uri = 'company/'+req.user.email+'/server/'+servername+'/unOwnerOf';
		} else {
			uri = 'user/'+req.user.email+'/server/'+servername+'/unOwnerOf';
		}
		rest.delOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if(error){
				return res.render('domains.jade', { user: req.user, server: servername, domains: [], owner: false, error: error });
			} else {
				res.redirect('/server/'+servername);
			}
		});
	});

	app.get('/server/:servername/domain/:domainname/delegate', auth.ensureAuthenticated, function(req, res){
		var uri;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+req.params.domainname+'/delegatorAndOthers';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+req.params.domainname+'/delegatorAndOthers';
		}

		rest.getOperation(ons_api_address, uri, null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('addDelegate.jade', { user: req.user, server: req.params.servername, others: [], error: error });
			}
			var others = response.others;
			console.log(others);
			res.render('addDelegate.jade', { user: req.user, server: req.params.servername, others: others, error: error });
		});
		
	});
	
	

	app.post('/server/:servername/domain/:domainname/delegate', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+domainname+'/delegate';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+domainname+'/delegate';
		}

		var args = "{\"companyname\":\""+req.body.delegator+"\", \"bound\":"+req.body.bound+"}";
		
		
		rest.postOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if (error) {
				return res.render('addDelegate.jade', { user: req.user, server: req.params.servername, others: [], error: error });
			}
			res.redirect('/server/'+servername);
		});
	});
	

	app.get('/server/:servername/domain/:domainname/unDelegate', auth.ensureAuthenticated, function(req, res){
		var uri;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+req.params.domainname+'/delegatorAndOthers';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+req.params.domainname+'/delegatorAndOthers';
		}

		rest.getOperation(ons_api_address, uri, null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('removeDelegate.jade', { user: req.user, server: req.params.servername, delegators: [], error: error });
			}
			var delegators = response.delegators;
			res.render('removeDelegate.jade', { user: req.user, server: req.params.servername, delegators: delegators, error: error });
		});
		
	});
	

	app.post('/server/:servername/domain/:domainname/unDelegate', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		var delegator = req.params.delegator;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+domainname+'/unDelegate';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+domainname+'/unDelegate';
		}

		var args = "{\"companyname\":\""+req.body.delegator+"\"}";
		
		
		rest.postOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if (error) {
				return res.render('removeDelegate.jade', { user: req.user, server: req.params.servername, delegators: [], error: error });
			}
			res.redirect('/server/'+servername);
		});
	});
	
	app.get('/server/:servername/domain/:domainname/export', auth.ensureAuthenticated, function(req, res){
		var uri;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+req.params.domainname+'/getRecords';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+req.params.domainname+'/getRecords';
		}

		rest.getOperation(ons_api_address, uri, null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('exportDomain.jade', { user: req.user, domain: req.params.domainname, server: req.params.servername, strRecords: '', error: error });
			}
			var strRecords = '';
			var records = response.records;
			for(var i=0 ; i< records.length; ++i){
				strRecords+=records[i].name + ' IN '+records[i].ttl +' '+records[i].type+' '+ records[i].content + '\n';
			}
			
			res.render('exportDomain.jade', { user: req.user, domain: req.params.domainname, server: req.params.servername, strRecords: strRecords, error: error });
		});
		
	});
	
	app.get('/server/:servername/domain/:domainname/import', auth.ensureAuthenticated, function(req, res){
	
		res.render('importDomain.jade', { user: req.user, domain: req.params.domainname, server: req.params.servername, error: null });

	});

	app.post('/server/:servername/domain/:domainname/import', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		var strRecords = req.body.strRecords;
		var arrRecords = strRecords.split('\r\n');
		var records = [];
		
		for(var i = 0; i< arrRecords.length ;  ++i){
			var attRecord = arrRecords[i].split(' ');
			var record = {};
			record.name = attRecord[0];
			record.ttl = attRecord[2];
			record.type = attRecord[3];
			record.content = attRecord[4];
			for(var j = 5; j< attRecord.length; ++j){
				record.content += ' '+ attRecord[j];
			}
			records.push(record);
		}

		var args = "{\"domainname\":\""+domainname+"\"}";
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+domainname;
		} else {
			uri = 'user/'+req.user.email+'/domain/'+domainname;
		}
		
		rest.delOperation(ons_api_address, uri+'/unHaveAll', null, req.user.token, null, args, function (error, response) {
			if(error){
				return res.render('importDomain.jade', { user: req.user, domain: domainname, server: servername, error: error });
			}
			var newArgs = "{\"records\":"+JSON.stringify(records)+"}";
			rest.postOperation(ons_api_address, uri+'/newRecords', null, req.user.token, null, newArgs, function (error, response) {
				if (error) {
					return res.render('importDomain.jade', { user: req.user, domain: domainname, server: servername, error: error });
				}
				res.redirect('/server/'+servername);
			});
		});
	});
	
	app.get('/server/:servername/domain/:domainname', auth.ensureAuthenticated, function(req, res){
		var uri;
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+req.params.domainname+'/getRecords';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+req.params.domainname+'/getRecords';
		}
		
		rest.getOperation(ons_api_address, uri, null, req.user.token, null, null, function (error, response) {
			if(error){
				return res.render('editDomain.jade', { user: req.user, domain: req.params.domainname, server: req.params.servername, records: [], delegatedRecords: [], owner: 'no', error: error });
			}
			res.render('editDomain.jade', { user: req.user, domain: req.params.domainname, server: req.params.servername, records: response.records, delegatedRecords: response.delegatedRecords, owner: response.owner, error: error });
		});
	});	
	

	app.post('/server/:servername/domain/:domainname', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+domainname;
		} else {
			uri = 'user/'+req.user.email+'/domain/'+domainname;
		}
	
		var records = req.body.records;
		var delegatedRecords = req.body.delegatedRecords;
		var newrecords = req.body.newrecords;
		
		if(delegatedRecords && delegatedRecords.id !== null && delegatedRecords.id instanceof Array ){
			var recordsParam = [];
			for (var idx = 0; idx < delegatedRecords.id.length; idx++) {
				var delegatedRecord = {};
				for (var key in delegatedRecords) {
					delegatedRecord[key] = delegatedRecords[key][idx];
				}
				
				if (delegatedRecord.type && delegatedRecord.type.length) {
					recordsParam.push(delegatedRecord);
				}
			} 
			delegatedRecords = recordsParam;
		} 
		
		
		if (records && records.id !== null && records.id instanceof Array) {
			var recordsParam = [];
			for (var idx = 0; idx < records.id.length; idx++) {
				var record = {};
				for (var key in records) {
					record[key] = records[key][idx];
				}

				recordsParam.push(record);
			}
			records = recordsParam;
		}
		
		if(newrecords && newrecords.id !== null && newrecords.id instanceof Array){
			var newRecordsParam = [];
			for (var idx = 0; idx < newrecords.id.length; idx++) {
				var record = {};
				for (var key in newrecords) {
					record[key] = newrecords[key][idx];
				}

				if (record.type && record.type.length) {
					newRecordsParam.push(record);
				}
			}
			newrecords = newRecordsParam;
		}
		
		var editArgs;
		if(delegatedRecords){
			editArgs = "{\"records\":"+JSON.stringify(delegatedRecords)+"}";
		} else{
			editArgs = "{\"records\":"+JSON.stringify(records)+"}";
			delegatedRecords = [];
		}
		rest.postOperation(ons_api_address, uri+'/editRecords', null, req.user.token, null, editArgs, function (error, response) {
			if (error) {
				return res.render('editDomain.jade', { user: req.user, domain: domainname, server: servername, records: records, delegatedRecords: delegatedRecords, owner: 'no', error: error });
			}
			if(newrecords.length && newrecords[0].type && newrecords[0].name && newrecords[0].ttl && newrecords[0].content){
				var newArgs = "{\"records\":"+JSON.stringify(newrecords)+"}"; 
				rest.postOperation(ons_api_address, uri+'/newRecords', null, req.user.token, null, newArgs, function (error, response) {
					if (error) {
						return res.render('editDomain.jade', { user: req.user, domain: domainname, server: servername, records: records, delegatedRecords: delegatedRecords, owner: 'no', error: error });
					}
					res.redirect('/server/'+servername+'/domain/'+domainname);
				});
			} else{
				res.redirect('/server/'+servername+'/domain/'+domainname);
			}
		});
	});

	app.get('/server/:servername/domain/:domainname/record/:recordname/id/:recordid/delete', auth.ensureAuthenticated, function(req, res){
		var uri;
		var domainname = req.params.domainname;
		var servername = req.params.servername;
		var recordname = req.params.recordname;
		var recordid = req.params.recordid;
		console.log(req.body);
		var args = "{\"recordname\":\""+recordname+"\",\"recordid\":\""+recordid+"\"}";
		
		if(company){
			uri = 'company/'+req.user.email+'/domain/'+domainname+'/unHave';
		} else {
			uri = 'user/'+req.user.email+'/domain/'+domainname+'/unHave';
		}
		rest.delOperation(ons_api_address, uri, null, req.user.token, null, args, function (error, response) {
			if(error){
				return res.render('editDomain.jade', { user: req.user, domain: domainname, server: servername, records: [], delegatedRecords: [], owner: 'no', error: error });
			} else {
				res.redirect('/server/'+servername+'/domain/'+domainname);
			}
		});
	});
	
	
	app.get('/:offset?/:count?', auth.ensureAuthenticated, function(req, res){
		var offset = req.param('offset', 0);
		var count = req.param('count', 10);

		rest.getOperation(ons_api_address, "checkRole/"+req.user.email, null, req.user.token, null, null, function (error, response) {
			var servers = null;
			var delegates = null;
			var server_total = 0;
			if(error){
				return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: [], delegates: [], total: server_total, error: error });
				
			}
			if(response.role === 'company'){
				company = true;
				rest.getOperation(ons_api_address, "company/"+req.user.email+"/manage", null, req.user.token, null, null, function (error, response) {
					if(error){
						return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
					}
					servers = response.servers;
					server_total = response.servers.length;
					rest.getOperation(ons_api_address, "company/"+req.user.email+"/delegateManage", null, req.user.token, null, null, function (error, response) {
						if(error){
							return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
						}
						delegates = response.servers;
						return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
						
					});
				});
			} else {
				company = false;
				rest.getOperation(ons_api_address, "user/"+req.user.email+"/manage", null, req.user.token, null, null, function (error, response) {
					if(error){
						return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
					}
					servers = response.servers;
					server_total = response.servers.length;
					rest.getOperation(ons_api_address, "user/"+req.user.email+"/delegateManage", null, req.user.token, null, null, function (error, response) {
						if(error){
							return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
						}
						delegates = response.servers;
						return res.render('server_list.jade', { company:company, user: req.user, offset: offset, count: count, servers: servers, delegates: delegates, total: server_total, error: error });
					});
				});
			}
		});
	});	
};
