// domain.js
// Domain model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Company = require('./company');
var Record = require('./record');
var Server = require('./server');
var config = require('../../config/conf.json');
var mysql = require('mysql');
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;
var rest = require('../../rest');
var cachedb = require('../cachedb');


var db = new neo4j.GraphDatabase({
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Domain = module.exports = function Domain(_node) {
    this._node = _node;
};

// Public constants:

Domain.VALIDATION_INFO = {
    'domainname': {
        required: true,
        minLength: 2,
        maxLength: 100,
        pattern: /^[A-Za-z0-9.]+$/,
        message: '2-100 characters; letters, numbers, and, \'.\' only.'
    },
};

// Public instance properties:

Object.defineProperty(Domain.prototype, 'domainname', {
    get: function () { return this._node.properties['domainname']; }
});

// Private helpers:

function validateProp(prop, val, required) {
 var info = Domain.VALIDATION_INFO[prop];
 var message = info.message;

 if (!val) {
     if (info.required && required) {
         throw new errors.ValidationError(
             'Missing ' + prop + ' (required).');
     } else {
         return;
     }
 }

 if (info.minLength && val.length < info.minLength) {
     throw new errors.ValidationError(
         'Invalid ' + prop + ' (too short). Requirements: ' + message);
 }

 if (info.maxLength && val.length > info.maxLength) {
     throw new errors.ValidationError(
         'Invalid ' + prop + ' (too long). Requirements: ' + message);
 }

 if (info.pattern && !info.pattern.test(val)) {
     throw new errors.ValidationError(
         'Invalid ' + prop + ' (format). Requirements: ' + message);
 }
}

function validate(props, required) {
    var safeProps = {};

    for (var prop in Domain.VALIDATION_INFO) {
    	if(Domain.VALIDATION_INFO.hasOwnProperty(prop)){
    		var val = props[prop];
    		validateProp(prop, val, required);
    		safeProps[prop] = val;
    	}
    }

    return safeProps;
}


function isConstraintViolation(err) {
    return err instanceof neo4j.ClientError &&
        err.neo4j.code === 'Neo.ClientError.Schema.ConstraintViolation';
}

// Public instance methods:

Domain.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (domain:Domain {domainname: {domainname}})',
        'SET domain += {props}',
        'RETURN domain',
    ].join('\n');

    var params = {
        domainname: this.domainname,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            err = new errors.ValidationError(
                'The domainname ‘' + props.domainname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }

        if (!results.length) {
            err = new Error('Domain has been deleted! Domainname: ' + self.domainname);
            return callback(err);
        }

        self._node = results[0]['domain'];

        callback(null);
    });
};

Domain.prototype.del = function (callback) {
    
	var query = [
	   'MATCH (domain:Domain {domainname: {thisDomainname}})',
	   'MATCH (domain)-[:have]->(record)',
	   'DETACH DELETE domain, record'
	   
	].join('\n');

    var params = {
        thisDomainname: this.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Domain.prototype.have = function (other, callback) {
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (other:Record {recordname: {otherRecordname}})',
        'MERGE (domain) -[rel:have]-> (other)',
    ].join('\n');

    var params = {
        thisDomainname: this.domainname,
        otherRecordname: other.recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Domain.prototype.un_have = function (other, callback) {
    var query = [
        'MATCH (:Domain {domainname: {thisDomainname}})-[:have]->(record:Record {recordname: {otherRecordname}})',
        'DETACH DELETE record',
    ].join('\n');

    var params = {
    	thisDomainname: this.domainname,
        otherRecordname: other.recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Domain.prototype.un_have_all = function (callback) {
	//Delete all records related to domain at once
    var query = [
        'MATCH (:Domain {domainname: {thisDomainname}})-[:have]->(record:Record)',
        'DETACH DELETE record',
    ].join('\n');

    var params = {
    	thisDomainname: this.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Domain.prototype.delegate = function (other, boundNum, callback) {
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (other:Company{companyname: {otherCompanyname}})',
        'CREATE (domain) -[rel:delegate {bound: {thisBoundNum}}]-> (other)',
    ].join('\n');

    var params = {
        thisDomainname: this.domainname,
        otherCompanyname: other.companyname,
        thisBoundNum: boundNum,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Domain.prototype.un_delegate = function (other, callback) {

	var query = [
	    'MATCH (domain:Domain {domainname: {thisDomainname}})',
	    'MATCH (other:Company {companyname: {otherCompanyname}})',
	    'MATCH (domain) -[rel:delegate]-> (other)',
	    'OPTIONAL MATCH (other)-[:delegator_of]->(record:Record)<-[:have]-(domain)',
	    'DETACH DELETE rel, record'
    ].join('\n');

	var params = {
		thisDomainname: this.domainname,
		otherCompanyname: other.companyname,
	};

	db.cypher({
		query: query,
		params: params,
		}, function (err) {
			callback(err);
	});
};


Domain.isExceededBound = function (companyname, domainname, callback) {
	cachedb.loadCachedData(companyname+':'+domainname+':isBounded', function(err, results){
		if(results && JSON.parse(results).result){
			cachedb.setExpire(companyname+':'+domainname+':isBounded', config.REDIS_DEFAULT_EXPIRE);
			if(JSON.parse(results).result === 'no'){
	    		return callback(null, {result: 'no'});
			}
		}
	    var query = [
	        'MATCH (domain:Domain {domainname: {thisDomainname}})',
	        'MATCH (other:Company {companyname: {otherCompanyname}})',
	        'MATCH (domain) -[rel:delegate]-> (other) -[:delegator_of]-> (record: Record) <-[:have]- (domain)',
	        'RETURN count(DISTINCT record), rel.bound',
	    ].join('\n');
	
	    var params = {
	    	thisDomainname: domainname,
	        otherCompanyname: companyname,
	    };
	
	    db.cypher({
	        query: query,
	        params: params,
	    }, function (err, results) {
	    	if(err){
	    		return callback(err);
	    	}
		    if(results.length){
		    	if(results[0]['rel.bound']===0 ){ //Bound of 0 means there is no number limitation for company
			    	cachedb.cacheDataWithExpire(companyname+':'+domainname+':isBounded', JSON.stringify({result: 'no'}), config.REDIS_DEFAULT_EXPIRE);
		    		return callback(null, {result: 'no'});
		    	} else if(results[0]['count(DISTINCT record)'] < results[0]['rel.bound']){ //Num of records does not exceed bound
		    		return callback(null, {result: 'no'});
		    	} else{ //Num of records exceeds bound
		    		return callback(null, {result: 'yes'});
		    	}
	    	} else{ //There are no records yet
	    		return callback(null, {result: 'no'});
	    	}
	    });
	});
};





Domain.get = function (domainname, callback) {
    var query = [
        'MATCH (domain:Domain {domainname: {domainname}})',
        'RETURN domain',
    ].join('\n');

    var params = {
        domainname: domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            err = new Error('No such domain with domainname: ' + domainname);
            return callback(err);
        }
        var domain = new Domain(results[0]['domain']);
        callback(null, domain);
    });
};



Domain.getDelegate = function (domainname, callback) {
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})-[:delegate]->(company:Company)',
        'RETURN company',
    ].join('\n');

    var params = {
        thisDomainname: domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var companies = [];

        for (var i = 0; i < results.length; i++) {
        	var company = new Company(results[i]['company']);
        	if(!company.companyname) {
        		return callback("Company exists, but its companyname does not exist");//this should not occur
        	}
        	companies.push(company.companyname);
        }
        callback(null, companies);
    });
};


Domain.prototype.getDelegatorAndOthers = function (company, callback) {
	//TODO: Change function name to 'getDelegateeAndOthers'
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (others:Company)',
        'WHERE NOT (others.companyname = {thisCompanyname})',
        'OPTIONAL MATCH (domain:Domain)-[rel:delegate]->(others)',
        'RETURN others.companyname, COUNT(rel)',
    ].join('\n');

    var params = {
    	thisDomainname: this.domainname,
        thisCompanyname: company.companyname,
    };
    
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        
        var others = [];
        var delegators = [];
        
        
        for (var i = 0; i < results.length; i++) {
            console.log(results[i]);
            var other = results[i]['others.companyname'];
            var delegator = results[i]['COUNT(rel)'];
            
            if (delegator) {
            	delegators.push(other); //Delegatees of domain
            } else {
            	others.push(other); //all companies excluding delegatees of domain
            }
        }
        callback(null, delegators, others);
    });
};



Domain.getHave = function (domainname, callback) {
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})-[:have]->(record:Record)',
        'RETURN record', 
    ].join('\n');

    var params = {
        thisDomainname: domainname,
    };

    var domain = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var records = [];

        for (var i = 0; i < results.length; i++) {
        	var record = new Record(results[i]['record']);
        	if(!record.recordname){
        		return callback("Record exists, but its recordname does not exist"); //This should not occur
        	}
        	records.push(record.recordname); //records that domain has
        }
        callback(null, records);
    });
};


Domain.getMapped = function (domainname, callback) {

	cachedb.loadCachedData(domainname+':mappedServer', function(err, results){
		if(results){
			cachedb.setExpire(domainname+':mappedServer', config.REDIS_DEFAULT_EXPIRE);
	    	return callback(null, JSON.parse(results));
		}
	    var query = [
	        'MATCH (domain:Domain {domainname: {thisDomainname}})<-[:map]-(server:Server)',
	        'RETURN server', 
	    ].join('\n');
	
	    var params = {
	        thisDomainname: domainname,
	    };
	
	    var domain = this;
	    db.cypher({
	        query: query,
	        params: params,
	    }, function (err, results) {
	        if (err) {
	        	return callback(err);
	        }
	
	        if (!results.length) {
	            err = new Error('No servers are mapped to domain: ' + domainname);
	            return callback(err);
	        }
	    	cachedb.cacheDataWithExpire(domainname+':mappedServer', JSON.stringify(results[0].server.properties), config.REDIS_DEFAULT_EXPIRE);
	        callback(null, results[0].server.properties); //Server that domain is mapped to
	    });
	});
};



Domain.getRecords = function (domainname, token, callback) {
	//Get records from back-end
	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }
		//TODO: Do not expose the password of DB
		var args="{\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}"; 
		rest.getOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
			if (error) {
	        	return callback(error);
			} 
			callback(null, response.records);
		});
	});
	
};



Domain.getDelegatedRecordByCompany = function (companyname, domainname, callback) {

    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (other:Company {companyname: {otherCompanyname}})',
        'MATCH (domain) -[:delegate]-> (other)',
        'MATCH (other)-[:delegator_of]->(record:Record)<-[:have]-(domain)',
        'RETURN record',
    ].join('\n');

    var params = {
        thisDomainname: domainname,
        otherCompanyname: companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var records = [];
        for (var i = 0; i < results.length; i++) {
        	var record = new Record(results[i]['record']);
        	if(!record.recordname){
        		return callback("Record exists, but its recordname does not exist"); //This should not occur
        	}
        	records.push(record);
        }
        callback(null, records);
    });
};




Domain.editRecords = function (domainname, editRecords, token, callback) {

	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }
			
		var args="{\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		//get all records from backend
		rest.getOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			} 
			var records = response.records;
			
			
			var found = 0;
			var changed = false;
			for(var i=0; i< records.length; ++i){
				for(var j=0; j<editRecords.length; ++j){
					if(records[i].id === Number(editRecords[j].id)){
						if(changed === false && 
							(records[i].name !== editRecords[j].name ||
							records[i].type !== editRecords[j].type ||
							records[i].ttl !== Number(editRecords[j].ttl) ||
							records[i].content !== editRecords[j].content)){
							changed= true; //Record is changed
						}
						found++;
						j=editRecords.length; //Escape for loop if matched record is found
					}
					
				}
			}
			if(found !== records.length){
	        	return callback("There exists un-matched ID for records from domain: "+domainname);
			}
			if(changed){
				found = 0;
				for(var i=0; i< editRecords.length; ++i){
					var recordJson = {
						name: editRecords[i].name, 
						type: editRecords[i].type,
						content: editRecords[i].content,
						ttl: editRecords[i].ttl
					};
					var argsJson = {record:recordJson, id:editRecords[i].id, dbUsername:server.dbUsername, dbPassword: server.dbPassword};
					var args=JSON.stringify(argsJson);
					//Put changed record in back-end 
					rest.putOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
						if (error) {
							var arrMsg = error.split(' ');
							if(arrMsg[0] !== 'Duplicate' || arrMsg[1] !== 'entry'){
								return callback(error);
							}
						} 
						found++;
						if(found === editRecords.length){		
					        return callback(null);
						}
					});
				}
			} else{
	        	return callback(null);	
			}
		});
	});
	
};

Domain.editDelegatedRecords = function (domainname, editRecords, token, callback) {

	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }
		var args="{\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		//get all records from back-end
		rest.getOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			}
			var records = response.records;
			var found = 0;
			var changed = false;
			var changedRecords=[];
			for(var i=0; i< records.length; ++i){
				for(var j=0; j<editRecords.length; ++j){
					if(records[i].id === Number(editRecords[j].id)){
						if((records[i].name !== editRecords[j].name ||
							records[i].type !== editRecords[j].type ||
							records[i].ttl !== Number(editRecords[j].ttl) ||
							records[i].content !== editRecords[j].content)){
							changed= true;
							changedRecords.push(records[i]); //Record is changed
						}
						found++;
						j=editRecords.length; //Escape for loop if matched record is found
					}
					
				}
			}
			if(found !== editRecords.length){
				
	        	return callback("There exists un-matched ID for records from domain: "+domainname);
			}
			if(changed){
				found = 0;
				for(var i=0; i< editRecords.length; ++i){
					var recordJson = {
						name: editRecords[i].name,
						type: editRecords[i].type,
						content: editRecords[i].content,
						ttl: editRecords[i].ttl,
					};
					var argsJson = {id:editRecords[i].id, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
					var args=JSON.stringify(argsJson);
					//Put changed record in back-end 
					rest.putOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
						if (error) {
							var arrMsg = error.split(' ');
							if(arrMsg[0] !== 'Duplicate' || arrMsg[1] !== 'entry'){
								return callback(error);
							}
						} 
						found++;
						if(found === editRecords.length){
							found = 0;
							for(var j=0; j< editRecords.length; ++j){
								for(var k=0; k<changedRecords.length; ++k){
									if(Number(editRecords[j].id) === changedRecords[k].id){
										Record.edit(changedRecords[k].name+':'+editRecords[j].id, 
										editRecords[j].name+':'+editRecords[j].id, 
										editRecords[j].type,  
										editRecords[j].content,
										function (error, record){
											if(error){
												return callback(error);
											}
											k = changedRecords.length;
											++found;
											if(changedRecords.length === found){
												return callback(null);
											}
										});
									}
								}
							}
						}
					});
				}
			} else{
				
	        	return callback(null);	
			}
		});
	
	});
};


Domain.newRecords = function (domainname, newRecords, token, callback) {

	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }

		var recordJson = { 
				name: newRecords.name, 
				type: newRecords.type,
				content: newRecords.content,
				ttl: newRecords.ttl,
			};
		var argsJson = {record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
		var args = JSON.stringify(argsJson);
		//Add new record to back-end
		rest.postOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
			if (error) {
				return callback(err);
			}
			return callback(null, response.recordId);
		});
	});
};


Domain.removeRecordAndHave = function (domainname, recordname, recordid, token, callback) {
	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }

		Record.get(recordname+':'+recordid, function(err, record){
			if(err){
				return callback(err);
			}
			var recordJson;
			if(record){
				recordJson = {name:recordname, type:record.recordtype, content:record.recordcontent};
			} else {
				recordJson = {name:recordname, id:recordid};
			}
			
			var argsJson = {record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
			var args=JSON.stringify(argsJson);
			//Delete record from back-end
			rest.delOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
				if (error) {
			       	return callback(error);
				}
				if(record){
					Domain.get(domainname, function(err, domain){
						if(err){
							return callback(err);
						}
						//Delete record from access control
						domain.un_have(record, function(err){
							return callback(err);
						});
					});
				} else{
					return callback(err);
				}
			});
		});
	});
};


Domain.removeAllRecordAndHave = function (domainname, token, callback) {
	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }
		Domain.get(domainname, function(err, domain){
			if(err){
				return callback(err);
			}	
			var args="{\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
			rest.getOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
				if (error) {
			       	return callback(error);
				}
				var records = response.records;
				var found = 0;
				if(records.length > 0){
					for(var i = 0; i< records.length; ++i){

						var recordJson = {name:records[i].name, type:records[i].type, content: records[i].content};
						var argsJson = {record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
						var args=JSON.stringify(argsJson);
						//Delete all records from back-end
						rest.delOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
							if (error) {
						       	return callback(error);
							}
							++found;
							if(found === records.length){
								//Delete all records from access control 
								domain.un_have_all(function(err){
									
									return callback(err);
								});
							}
						});
					}
				} else{

					return callback(null);
				}
			});
		});
	});
};



Domain.removeDelegateAndDelegatorOf = function (domainname, companyname, token, callback) {

	Domain.getMapped(domainname, function(err, server){
        Domain.get(domainname, function(err, domain){
        	if(err){
        		return callback(err);
        	}
			Domain.getRecords(req.params.domainname, req.oauth.bearerToken.accessToken, function(err, records){
				if(err) {
					return res.send({ error : err});
				}
		        	
				Domain.getDelegatedRecordByCompany(companyname, domainname, function(err, delegatedRecords){
					if(err){
			       		return callback(err);
					}
					var Company =  require('./company');
		        	Company.get(companyname, function(err, company){
			        	if(err){
			        		return callback(err);
			        	}
			        	
						if(delegatedRecords.length){ //Records by delegatee exist

							var delegatedRecordParams=[];
							var delegatedId = [];
							for(var i=0; i< delegatedRecords.length; ++i){
								var strArray = delegatedRecords[i].recordname.split(':');
								delegatedId.push(strArray[1]);
							}
							for(var i=0; i< records.length; ++i){
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
							var count = 0;
							
							for (var i =0; i < delegatedRecords.length; ++i){
	
								var recordJson = {name:delegatedRecords[i].recordname, type:delegatedRecords[i].recordtype, content: delegatedRecords[i].content};
								var argsJson = {record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
								var args=JSON.stringify(argsJson);
								//Delete delegated record from back-end
								rest.delOperation("http://"+server.servername, "domain/"+domainname+"/record", null, token, null, args, function (error, response) {
									if (error) {
								       	return callback(error);
									}
									++count;
									
									if(count === records.length){
										//Delete delegated record from access control
										domain.un_delegate(company, function(err){
											return callback(err);
										});
									}
								});
							}		
						} else{
							domain.un_delegate(company, function(err){
								
								return callback(err);
							});
						}
					});
		        });
			});
	    });
	});
};


Domain.create = function (props, callback) {
    var query = [
        'CREATE (domain:Domain {props})',
        'RETURN domain',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            err = new errors.ValidationError(
                'The domainname ‘' + props.domainname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }
        var domain = new Domain(results[0]['domain']);
        callback(null, domain);
    });
};