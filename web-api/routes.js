var bodyParser = require('body-parser'),
	oauthserver = require('oauth2-server'),
	md5 =  require('md5'),
	auth = require('./models/ACL/auth'),
	User = require('./models/ACL/user'),
	Company = require('./models/ACL/company'),
	Domain = require('./models/ACL/domain'),
	Record = require('./models/ACL/record'),
	Server = require('./models/ACL/server'),
	rest = require('./rest');

var config = require('./config/conf.json');


exports.configure = function (app) {	
	 
	app.use(bodyParser.urlencoded({ extended: true }));
	 
	app.use(bodyParser.json());
	 
	app.oauth = oauthserver({
	  model: require('./models/ACL/auth'), 
	  grants: ['password', 'refresh_token'],
	  debug: true,
	  accessTokenLifetime: 36000
	});

	app.all('/oauth/token', app.oauth.grant()); 
	
	app.use(app.oauth.errorHandler());

	app.post('/signup', function (req, res){
		
		auth.getUserbyUsername(req.body.username, function(err, result){
			if(err || result){
				res.send(err? { error : err }: { error : "user already exists"});
				return;
			} 
			auth.saveUser(req.body.username, req.body.password, function(err){
				if(err){
					res.send({ error : err });
					return;
				}
				auth.saveOauthClient(req.body.username.replace(/\./gi,"").replace(/@/gi,""), req.body.password, '/', function(err, result){
					if(err){
						res.send({ error : err });
						return;
					}
					console.log(req.body.usertype);
    			    if(req.body.usertype === "Employee"){
	    			    User.create({'username':req.body.username}, function(err, user){
			    			if(err){
								res.send({ error : err });
								return;
			    			}
		    			    res.send({result: "success"});
    			    	});
    			    } else {
	    			    Company.create({'companyname':req.body.username}, function(err, user){
			    			if(err){
								res.send({ error : err });
								return;
			    			}
		    			    res.send({result: "success"});
    			    	});
    			    	
    			    }
				});
			});
		});
	});


	app.get('/checkRole/:name', app.oauth.authorise(), function (req, res){
		Company.get(req.params.name, function(err, company){
			if(err) {
				return res.send({role: "user"});
			}
			res.send({role: "company"});
		});
	});

	app.get('/allCompanies', app.oauth.authorise(), function (req, res){
		Company.getAll(function(err, companies){
			if(err) {
				return res.send({error: err});
			}
			res.send({companies: companies});
		});
	});


	app.get('/getClientidAndToken', function(req, res){
		auth.getClientidAndToken(function (err, results){
			if (err){
				console.log(err);
				return res.send({error: err});
			}
			return res.send(results);
			
		});
	});
//this API should be implemented in db api
/*	app.get('/removeAllRecords/:servername', function(req, res){
		Record.removeAllRecordsfromServer(req.params.servername, function(err, results){
			if (err){
				console.log(err);
				return res.send({error: err});
			}
			return res.send({result: "success"});
		});
	});*/
	
/*************************company API*************************************/	
	app.get('/company/:companyname/owner_of', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.getOwnerOf(req.params.companyname, function (err, domains){
				if(err) {
					return res.send({error: err});
				}
				res.send({domains:domains});
			});
		});
	});

	app.get('/company/:companyname/manage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			
			Company.getManage(req.params.companyname, function (err, servers){
				if(err) {
					return res.send({error: err});
				}
				res.send({servers:servers});
			});
		});
	});
	

	app.get('/company/:companyname/delegateManage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.getDelegateManage(req.params.companyname, function (err, servers){
				if(err) {
					return res.send({error: err});
				}
				res.send({servers:servers});
			});
		});
	});
	
	app.post('/company/:companyname/manage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Server.getDomains(req.body.servername, req.body.serverport, req.oauth.bearerToken.accessToken, req.body.dbUsername, req.body.dbPassword, req.body.dbName, function(err, domainnames){
				if(err){
					return res.send({ error : err});
				}
				Server.create({'servername':req.body.servername+':'+req.body.serverport, 'dbUsername':req.body.dbUsername,'dbPassword':req.body.dbPassword, 'dbName':req.body.dbName}, function(err, server){
					if(err){
						return res.send({ error : err});
					}
					Server.mapDomains(server.servername, domainnames, function(err){
						if(err) {
							return res.send({error :  err});
						}
						Company.get(req.params.companyname, function(err, company){
							if(err) {
								return res.send({ error : err});
							}
							company.manage(server, function(err){
								if(err) {
									return res.send({ error : err});
								}
								Company.ownerOfDomains(req.params.companyname, domainnames, function(err){
									if(err){
										return res.send({error :  err});
									}
							    	res.send({result: "success"});
								});
							});
						});
					});
				});
			});
		});
	});
	

	
	app.del('/company/:companyname/unManage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			var companyname = req.params.companyname;
			var servername = req.body.servername;
			
			Company.get(companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access server:'+servername});
						}
						company.un_manage(server, function(err){
							if(err) {
								return res.send({ error : err});
							}
						   	res.send({result: "success"});
						});
					});
				});
			});
		});
	});
	
	
	
	app.post('/company/:companyname/employeeOf', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				User.get(req.body.username, function(err, user){
					if(err) {
						return res.send({ error : err});
					}
					user.employee_of(company, function(err){
						if(err) {
							return res.send({ error : err});
						}
				    	res.send({result: "success"});
					});
				});
			});
		});
	});
	
	app.post('/company/:companyname/onsAdministratorOf', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				User.get(req.body.username, function(err, user){
					if(err) {
						return res.send({ error : err});
					}
					user.ons_administrator_of(company, function(err){
						if(err) {
							return res.send({ error : err});
						}
						user.un_request(company, function(err){
							if(err) {
								return res.send({ error : err});
							}
					    	res.send({result: "success"});
						});
					});
				});
			});
		});
	});

	app.get('/company/:companyname/administorAndOthers', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
			
				company.getAdministratorAndOthers(function (err, employees, administrators, requests, others){
					if(err) {
						return res.send({error: err});
					}
					res.send({employees:employees, administrators: administrators, requests: requests, others: others});
				});
			});
		});
	});
	
	app.get('/company/:companyname/domain/:domainname/delegatorAndOthers', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(req.params.domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
				
					domain.getDelegatorAndOthers(company, function (err, delegators, others){
						if(err) {
							return res.send({error: err});
						}
						res.send({delegators: delegators, others: others});
					});
				});
			});
		});
	});


	app.get('/company/:companyname/server/:servername/map', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(req.params.servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							company.isDelegatedByServer(server, function(err, response){
								if(err) {
									return res.send({ error : err});
								}
								if(response.result === 'no'){
									return res.send({ error : 'You do not have authority to access server:'+req.params.servername});
								}
								Server.getDelegatedDomainByCompany(company.companyname, server.servername, function(err, domains){
									if(err){
										return res.send({ error : err});
									}
									res.send({owner: 'no',  domains:domains});
								});
							});
						}
						else{
							Server.getMap(req.params.servername, function(err, domains){
								if(err){
									return res.send({ error : err});
								}
								res.send({owner: 'yes', domains:domains});
							});
						}
					});
				});
			});
		});
	});
	

	app.post('/company/:companyname/server/:servername/map', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			var companyname = req.params.companyname;
			var servername = req.params.servername;
			var domainname = req.body.domainname;
			
			Company.get(companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access server:'+req.params.servername});
						}
						Server.makeDomainAndMap(servername, domainname, req.oauth.bearerToken.accessToken, function(err){
							if(err){
								return res.send({ error : err});
							}
							Domain.get(domainname, function(err, domain){
								if(err) {
									return res.send({ error : err});
								}
								company.owner_of(domain, function(err){
									if(err) {
										return res.send({ error : err});
									}
								    res.send({result: "success"});
								});
							});
						});
					});
				});	
			});
		});
		
	});
	
	
	app.del('/company/:companyname/server/:servername/unOwnerOf', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			var companyname = req.params.companyname;
			var domainname = req.body.domainname;
			var servername = req.params.servername;
			
			Company.get(companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access domain:'+domainname});
						}	
						Server.removeDomainAndMap(servername, domainname, req.oauth.bearerToken.accessToken, function(err){
							if(err) {
								return res.send({ error : err});
							}
						   	res.send({result: "success"});
						});
					});
				});
			});
		});
	});
	
	
	


	app.get('/company/:companyname/domain/:domainname/getRecords', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(req.params.domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							company.isDelegatedByDomain(domain, function(err, response){
								if(err) {
									return res.send({ error : err});
								}
								if(response.result === 'no'){
									return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
								}
								Domain.getRecords(req.params.domainname, req.oauth.bearerToken.accessToken, function(err, records){
									if(err) {
										return res.send({ error : err});
									}
									Domain.getDelegatedRecordByCompany(company.companyname, domain.domainname, function(err, delegatedRecords){
										if(err) {
											return res.send({ error : err});
										}
										var delegatedRecordParams=[];

										var delegatedId = [];
										for(var i=0; i< delegatedRecords.length; ++i){
											var strArray = delegatedRecords[i].recordname.split(':');
											delegatedId.push(strArray[1]);
										}
										for(i=0; i< records.length; ++i){
											for(var j=0; j< delegatedId.length; ++j){
												if(records[i].id.toString() === delegatedId[j])
												{
													delegatedRecordParams.push(records[i]);
													records.splice(i, 1);
													j=delegatedId.length;
													--i;
												}
											}
										}
										delegatedRecords = delegatedRecordParams;
										res.send({owner: 'no', records: records, delegatedRecords: delegatedRecords});
									});
								});
							});
						}
						else {
							Domain.getRecords(req.params.domainname, req.oauth.bearerToken.accessToken, function(err, records){
								if(err) {
									return res.send({ error : err});
								}
								res.send({owner: 'yes', records: records, delegatedRecords: []});
							});
						}
					});
				});
			});
		});
	});
	
	app.post('/company/:companyname/domain/:domainname/editRecords', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(req.params.domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						var refinedRecords = Record.refineRecords(req.params.domainname, req.body.records);
						if(Record.checkRecords(refinedRecords)){
							if(response.result === 'no'){
								company.isDelegatedByDomain(domain, function(err, response){
									if(err) {
										return res.send({ error : err});
									}
									if(response.result === 'no'){
										return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
									}
									Domain.editDelegatedRecords(req.params.domainname, refinedRecords, req.oauth.bearerToken.accessToken, function(err){
										if(err) {
											return res.send({ error : err});
										}
										res.send({result: "success"});
									});
								});
							} else {
								Domain.editRecords(req.params.domainname, refinedRecords, req.oauth.bearerToken.accessToken, function(err){
									if(err) {
										return res.send({ error : err});
									}
									res.send({result: "success"});
								});
							}
						} else{
							return res.send({ error : "one of records makes syntax error"});
						}
					});
				});
			});
		});
	});
	
	app.post('/company/:companyname/domain/:domainname/newRecords', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			
			Company.getCompanyOwnerOfDomain(req.params.companyname, req.params.domainname, function(err, type){
				if(err) {
					return res.send({ error : err});
				}
				if(type !== 'no'){
					var refinedRecords = Record.refineRecords(req.params.domainname, req.body.records);
					if(Record.checkRecords(refinedRecords)){
						if(type === 'delegator'){
							Domain.isExceededBound(req.params.companyname, req.params.domainname, function(err, response){
								if(err) {
									return res.send({ error : err});
								}
								if(response.result !== 'no'){
									return res.send({ error : 'Number of delegated records reaches to maximum'});
								}
								for(var i in refinedRecords) {
									Domain.newRecords(req.params.domainname, refinedRecords[i], req.oauth.bearerToken.accessToken, function(err, recordId){
										if(err) {
											var arrMsg = error.split(' ');
											if(arrMsg[0]!=='ER_DUP_ENTRY:'){
												console.log(err)
												return res.send({ error : err});
											}
											return res.send({result: "success"});
										}
										Record.createAndMakeRelationships(refinedRecords[i].name+':'+recordId, refinedRecords[i].type, refinedRecords[i].content, req.params.domainname, req.params.companyname, function(err){
											if(err) {  //err.neo4j.code
												console.log(err)
											}
										});
										return res.send({result: "success"});
									});
								}
							}); 
						} else {
							Domain.newRecords(req.params.domainname, refinedRecords[0], req.oauth.bearerToken.accessToken, function(err, recordId){
								if(err) {
									var arrMsg = error.split(' ');
									if(arrMsg[0]!=='ER_DUP_ENTRY:'){
										
										return res.send({ error : err});
									}
								}
								return res.send({result: "success"});
							});
						}
					} else{
						return res.send({ error : "one of records makes syntax error"});
					}
				}else{
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});

	app.post('/company/:companyname/domain/:domainname/delegate', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(req.params.domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}

						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
						}
						Company.get(req.body.companyname, function(err, otherCompany){
							if(err) {
								return res.send({ error : err});
							}
							domain.delegate(otherCompany, req.body.bound, function(err){
								if(err) {
									return res.send({ error : err});
								}
								res.send({result: "success"});
							});
						});
					});
				});
			});
		});
	});

	app.post('/company/:companyname/domain/:domainname/unDelegate', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			
			Company.get(req.params.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(req.params.domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}

						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
						}
						Company.get(req.body.companyname, function(err, otherCompany){
							if(err) {
								return res.send({ error : err});
							}
							Domain.removeDelegateAndDelegatorOf(domain.domainname, otherCompany.companyname, req.oauth.bearerToken.accessToken, function(err){
								if(err) {
									return res.send({ error : err});
								}
								res.send({result: "success"});
							});
						});
					});
				});
			});
		});
	});
	
	
	app.del('/company/:companyname/domain/:domainname/unHave', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by username: ' + req.params.companyname});
			}
			var companyname = req.params.companyname;
			var domainname = req.params.domainname;
			var recordname = req.body.recordname;
			var recordid = req.body.recordid;
			
			Company.get(companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							Record.get(recordname+':'+recordid, function(err, record){
								if(err) {
									return res.send({ error : err});
								}
								company.isDelegatorOf(record, function(err, response){
									if(err) {
										return res.send({ error : err});
									}
									if(response.result === 'no'){
										return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
									}
									Domain.removeRecordAndHave(domainname, recordname, recordid, req.oauth.bearerToken.accessToken, function(err){
										if(err) {
											return res.send({ error : err});
										}
										res.send({result: "success"});
									});
								});
							});
						} else{
							Domain.removeRecordAndHave(domainname, recordname, recordid, req.oauth.bearerToken.accessToken, function(err){
								if(err) {
									return res.send({ error : err});
								}
								res.send({result: "success"});
							});
						}
					});
				});
			});
		});
	});
	

	app.del('/company/:companyname/domain/:domainname/unHaveAll', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.companyname){
				return res.send({error: 'you are not authenticated by companyname: ' + req.params.companyname});
			}
			var companyname = req.params.companyname;
			var domainname = req.params.domainname;
			
			Company.get(companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to remove all records in domain:'+req.params.domainname});
						} 
						Domain.removeAllRecordAndHave(domainname, req.oauth.bearerToken.accessToken, function(err){
							if(err) {
								return res.send({ error : err});
							}
							res.send({result: "success"});
						});
					});
				});
			});
		});
	});
	
	
/*************************User API*************************************/	
	
	app.get('/user/:username/manage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			User.getManage(req.params.username, function (err, servers){
				if(err) {
					return res.send({error: err});
				}
				res.send({servers:servers});
			});
		});
	});

	app.get('/user/:username/delegateManage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			User.getDelegateManage(req.params.username, function (err, servers){
				if(err) {
					return res.send({error: err});
				}
				res.send({servers:servers});
			});
		});
	});


	app.del('/user/:username/unManage', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			var username = req.params.username;
			var servername = req.body.servername;
			
			User.getCompanyManagingServer(username, servername, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access server:'+servername});
						}
						company.un_manage(server, function(err){
							if(err) {
								return res.send({ error : err});
							}
						   	res.send({result: "success"});
						});
					});
				});
			});
		});
	});
	
	app.post('/user/:username/request', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			Company.get(req.body.companyname, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				User.get(req.params.username, function(err, user){
					if(err) {
						return res.send({ error : err});
					}
					user.request(company, function(err){
						if(err) {
							return res.send({ error : err});
						}
				    	res.send({result: "success"});
					});
				});
			});
		});
	});
	
	
	app.get('/user/:username/domain/:domainname/delegatorAndOthers', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			User.getCompanyOwnerOfDomain(req.params.username, req.params.domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(req.params.domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
				
						domain.getDelegatorAndOthers(company, function (err, delegators, others){
							if(err) {
								return res.send({error: err});
							}
							res.send({delegators: delegators, others: others});
						});
					});
				} else {
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});

	app.get('/user/:username/server/:servername/map', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}

			User.getCompanyManagingServer(req.params.username, req.params.servername, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(req.params.servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							company.isDelegatedByServer(server, function(err, response){
								if(err) {
									return res.send({ error : err});
								}
								if(response.result === 'no'){
									return res.send({ error : 'You do not have authority to access server:'+req.params.servername});
								}
								Server.getDelegatedDomainByCompany(company.companyname, server.servername, function(err, domains){
									if(err){
										return res.send({ error : err});
									}
									res.send({owner: 'no',  domains:domains});
								});
							});
						}
						else{
							Server.getMap(req.params.servername, function(err, domains){
								if(err){
									return res.send({ error : err});
								}
								res.send({owner: 'yes', domains:domains});
							});
						}
					});
				});
			});			
		});
	});


	app.post('/user/:username/server/:servername/map', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			var username = req.params.username;
			var servername = req.params.servername;
			var domainname = req.body.domainname;

			User.getCompanyManagingServer(username, servername, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Server.get(servername, function(err, server){
					if(err) {
						return res.send({ error : err});
					}
					company.isManaging(server, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access server:'+req.params.servername});
						}
						Server.makeDomainAndMap(servername, domainname, req.oauth.bearerToken.accessToken, function(err){
							if(err){
								return res.send({ error : err});
							}
							Domain.get(domainname, function(err, domain){
								if(err) {
									return res.send({ error : err});
								}
								company.owner_of(domain, function(err){
									if(err) {
										return res.send({ error : err});
									}
								    res.send({result: "success"});
								});
							});
						});
					});
				});	
			});
		});
	});
	
	
	app.del('/user/:username/server/:servername/unOwnerOf', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			
			
			var username = req.params.username;
			var domainname = req.body.domainname;
			var servername = req.params.servername;
			
			User.getCompanyManagingServer(username, servername, function(err, company){
				if(err) {
					return res.send({ error : err});
				}
				Domain.get(domainname, function(err, domain){
					if(err) {
						return res.send({ error : err});
					}
					company.is_owner_of(domain, function(err, response){
						if(err) {
							return res.send({ error : err});
						}
						if(response.result === 'no'){
							return res.send({ error : 'You do not have authority to access domain:'+domainname});
						}	
						Server.removeDomainAndMap(servername, domainname, req.oauth.bearerToken.accessToken, function(err){
							if(err) {
								return res.send({ error : err});
							}
						   	res.send({result: "success"});
						});
					});
				});
			});
		});
	});

	app.get('/user/:username/domain/:domainname/getRecords', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			User.getCompanyOwnerOfDomain(req.params.username, req.params.domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(req.params.domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
							if(response.result === 'no'){
								if(err) {
									return res.send({ error : err});
								}
								Domain.getRecords(req.params.domainname, req.oauth.bearerToken.accessToken, function(err, records){
									if(err) {
										return res.send({ error : err});
									}
									Domain.getDelegatedRecordByCompany(company.companyname, domain.domainname, function(err, delegatedRecords){
										if(err) {
											return res.send({ error : err});
										}
										var delegatedRecordParams=[];
										var delegatedId = [];
										for(var i=0; i< delegatedRecords.length; ++i){
											var strArray = delegatedRecords[i].recordname.split(':');
											delegatedId.push(strArray[1]);
										}
										for(i=0; i< records.length; ++i){
											for(var j=0; j< delegatedId.length; ++j){
												if(records[i].id.toString() === delegatedId[j])
												{
													delegatedRecordParams.push(records[i]);
													records.splice(i, 1);
													j=delegatedId.length;
													--i;
												}
											}
										}
										delegatedRecords = delegatedRecordParams;
										res.send({owner: 'no', records: records, delegatedRecords: delegatedRecords});
									});
								});
							}
							else {
								Domain.getRecords(req.params.domainname, req.oauth.bearerToken.accessToken, function(err, records){
									if(err) {
										return res.send({ error : err});
									}
									res.send({owner: 'yes', records: records, delegatedRecords: []});
								});
							}
						});
					});
				} else {
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});
	
	app.post('/user/:username/domain/:domainname/editRecords', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			
			User.getCompanyOwnerOfDomain(req.params.username, req.params.domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(req.params.domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
							var refinedRecords = Record.refineRecords(req.params.domainname, req.body.records);
							if(Record.checkRecords(refinedRecords)){
								if(response.result === 'no'){
									Domain.editDelegatedRecords(req.params.domainname, refinedRecords, req.oauth.bearerToken.accessToken, function(err){
										if(err) {
											return res.send({ error : err});
										}
										res.send({result: "success"});
									});
								} else {
									Domain.editRecords(req.params.domainname, refinedRecords, req.oauth.bearerToken.accessToken, function(err){
										if(err) {
											return res.send({ error : err});
										}
										res.send({result: "success"});
									});
								}
							} else{
								return res.send({ error : "one of records makes syntax error"});
							}
						});
					});
				} else {
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});
	
	app.post('/user/:username/domain/:domainname/newRecords', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}

			User.getCompanyAdministratorOf(req.params.username, function(err, companyname){
				if(err) {
					return res.send({ error : err});
				}
				Company.getCompanyOwnerOfDomain(companyname, req.params.domainname, function(err, type){
					if(err) {
						return res.send({ error : err});
					}
					if(type!=='no'){
						var refinedRecords = Record.refineRecords(req.params.domainname, req.body.records);
						if(Record.checkRecords(refinedRecords)){
							if(type === 'delegator'){
								Domain.isExceededBound(companyname, req.params.domainname, function(err, response){
									if(err) {
										return res.send({ error : err});
									}
									if(response.result !== 'no'){
										return res.send({ error : 'Number of delegated records reaches to maximum'});
									}	
									Domain.newRecords(req.params.domainname, refinedRecords[0], req.oauth.bearerToken.accessToken, function(err, recordId){
										if(err) {
											var arrMsg = error.split(' ');
											if(arrMsg[0]!=='ER_DUP_ENTRY:'){
												console.log(err);
												return res.send({ error : err});
											}
											return res.send({result: "success"});
										}
										Record.createAndMakeRelationships(refinedRecords[0].name+':'+recordId, refinedRecords[0].type, refinedRecords[0].content, req.params.domainname, companyname, function(err){
											if(err) { //error.neo4j.code
												console.log(err)
											}
										});	
										return res.send({result: "success"});
									});
								}); 
							} else{
								Domain.newRecords(req.params.domainname, refinedRecords[0], req.oauth.bearerToken.accessToken, function(err, recordId){
									if(err) {
										var arrMsg = error.split(' ');
										if(arrMsg[0]!=='ER_DUP_ENTRY:'){
											console.log(err.neo4j);
											return res.send({ error : err});
										}
									}
									return res.send({result: "success"});
								});
							}
						} else{
							return res.send({ error : "one of records makes syntax error"});
						}
					} else {
						return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
					}
				});
			});
		});
	});

	app.post('/user/:username/domain/:domainname/delegate', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}

			User.getCompanyOwnerOfDomain(req.params.username, req.params.domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(req.params.domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
	
							if(response.result === 'no'){
								return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
							}
							Company.get(req.body.companyname, function(err, otherCompany){
								if(err) {
									return res.send({ error : err});
								}
								domain.delegate(otherCompany, req.body.bound, function(err){
									if(err) {
										return res.send({ error : err});
									}
									res.send({result: "success"});
								});
							});
						});
					});
				}  else {
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});


	app.post('/user/:username/domain/:domainname/unDelegate', app.oauth.authorise(), function (req, res){

		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}

			User.getCompanyOwnerOfDomain(req.params.username, req.params.domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(req.params.domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
	
							if(response.result === 'no'){
								return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
							}
							Company.get(req.body.companyname, function(err, otherCompany){
								if(err) {
									return res.send({ error : err});
								}
								Domain.removeDelegateAndDelegatorOf(domain.domainname, otherCompany.companyname, req.oauth.bearerToken.accessToken, function(err){
									if(err) {
										return res.send({ error : err});
									}
									res.send({result: "success"});
								});
							});
						});
					});
				}  else {
					return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
				}
			});
		});
	});
	
	
	app.del('/user/:username/domain/:domainname/unHave', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			var username = req.params.username;
			var domainname = req.params.domainname;
			var recordname = req.body.recordname;
			var recordid = req.body.recordid;
			
			User.getCompanyOwnerOfDomain(username, domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
							if(response.result === 'no'){
								Record.get(recordname+':'+recordid, function(err, record){
									if(err) {
										return res.send({ error : err});
									}
									company.isDelegatorOf(record, function(err, response){
										if(err) {
											return res.send({ error : err});
										}
										if(response.result === 'no'){
											return res.send({ error : 'You do not have authority to access domain:'+req.params.domainname});
										}
										Domain.removeRecordAndHave(domainname, recordname, recordid, req.oauth.bearerToken.accessToken, function(err){
											if(err) {
												return res.send({ error : err});
											}
											res.send({result: "success"});
										});
									});
								});
							} else{
								Domain.removeRecordAndHave(domainname, recordname, recordid, req.oauth.bearerToken.accessToken, function(err){
									if(err) {
										return res.send({ error : err});
									}
									res.send({result: "success"});
								});
							}
						});
					});
				}  else {
					return res.send({ error : 'You do not have authority to access domain:'+domainname});
				}
			});
		});
	});
	
	app.del('/user/:username/domain/:domainname/unHaveAll', app.oauth.authorise(), function (req, res){
		auth.getUserbyToken(req.oauth.bearerToken.accessToken, function(err, results){
			if(err){
				console.log(err);
				return res.send({error: err});
			}
			if(results.username !== req.params.username){
				return res.send({error: 'you are not authenticated by username: ' + req.params.username});
			}
			var username = req.params.username;
			var domainname = req.params.domainname;
			
			User.getCompanyOwnerOfDomain(username, domainname, function(err, company, type){
				if(err) {
					return res.send({ error : err});
				}
				if(company){
					Domain.get(domainname, function(err, domain){
						if(err) {
							return res.send({ error : err});
						}
						company.is_owner_of(domain, function(err, response){
							if(err) {
								return res.send({ error : err});
							}
							if(response.result === 'no'){
								return res.send({ error : 'You do not have authority to remove all records in domain:'+req.params.domainname});
							} 
							Domain.removeAllRecordAndHave(domainname, req.oauth.bearerToken.accessToken, function(err){
								if(err) {
									return res.send({ error : err});
								}
								res.send({result: "success"});
							});
						});
					});
				}  else {
					return res.send({ error : 'You do not have authority to access domain:'+domainname});
				}
			});
		});
	});
};
	
