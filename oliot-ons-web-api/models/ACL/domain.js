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



var db = new neo4j.GraphDatabase({
    // Support specifying database info via environment variables,
    // but assume Neo4j installation defaults.
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Domain = module.exports = function Domain(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
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

// The domain's domainname, e.g. 'aseemk'.
Object.defineProperty(Domain.prototype, 'domainname', {
    get: function () { return this._node.properties['domainname']; }
});

// Private helpers:

//Validates the given property based on the validation info above.
//By default, ignores null/undefined/empty values, but you can pass `true` for
//the `required` param to enforce that any required properties are present.
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

// Takes the given caller-provided properties, selects only known ones,
// validates them, and returns the known subset.
// By default, only validates properties that are present.
// (This allows `Domain.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Domain.create`.)
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

// Atomically updates this domain, both locally and remotely in the db, with the
// given property updates.
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
            // TODO: This assumes domainname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the domainname is taken or not.
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

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['domain'];

        callback(null);
    });
};

Domain.prototype.del = function (callback) {
    // Use a Cypher query to delete both this domain and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    
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


Domain.prototype.isExceededBound = function (other, bound, callback) {
	if(bound === 0){
		return callback(null, {result: 'no'});
	}
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (other:Company {companyname: {otherCompanyname}})',
        'MATCH (domain) -[:delegate]-> (other) -[:delegator_of]-> (record: Record) <-[:have]- (domain)',
        'RETURN count(DISTINCT record)',
    ].join('\n');

    var params = {
    	thisDomainname: this.domainname,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
    	if(err){
    		return callback(err);
    	}
    	if(results[0]['count(DISTINCT record)'] >= bound){
    		return callback(null, {result: 'yes'});
    	} else{
    		return callback(null, {result: 'no'});
    	}
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

    // Query all domains and whether we follow each one or not:
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})-[:delegate]->(company:Company)',
        'RETURN company', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,company){
            //	if(company)
        	var company = new Company(results[i]['company']);
        	if(!company.companyname) {
        		return callback("Company exists, but its companyname does not exist");
        	}
        	companies.push(company.companyname);
        	//var companies = new company.Company(results[i]['company']);
            //ownerships.push(companies.gs1code);
        	//var domains = new Domain(results[i]['company']);
        	//ownerships.push(domains.domainname);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, companies);
    });
};


Domain.prototype.getDelegatorAndOthers = function (company, callback) {

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
            	delegators.push(other);
            } else {
            	others.push(other);
            }
        }
        callback(null, delegators, others);
    });
};



Domain.getHave = function (domainname, callback) {

    // Query all domains and whether we follow each one or not:
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})-[:have]->(record:Record)',
        'RETURN record', // COUNT(rel) is a hack for 1 or 0
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
        		return callback("Record exists, but its recordname does not exist");
        	}
        	records.push(record.recordname);
        }
        callback(null, records);
    });
};


Domain.getMapped = function (domainname, callback) {

    // Query all domains and whether we follow each one or not:
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})<-[:map]-(server:Server)',
        'RETURN server', // COUNT(rel) is a hack for 1 or 0
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
        callback(null, results[0].server.properties);
    });
};



Domain.getRecords = function (domainname, token, callback) {

	Domain.getMapped(domainname, function(err, server){
		if(err) {
        	return callback(err);
        }
		var args="{\"domainname\":\""+domainname+"\",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		rest.postOperation("http://"+server.servername, "records/list", null, token, null, args, function (error, response) {
			if (error) {
	        	return callback(error);
			} 
			callback(null, response.records);
		});
	});
	
};



Domain.getDelegatedRecordByCompany = function (companyname, domainname, callback) {
	
    // Query all companys and whether we follow each one or not:
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
        		return callback("Record exists, but its recordname does not exist");
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
			
		var args="{\"domainname\":\""+domainname+"\",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		rest.postOperation("http://"+server.servername, "records/list", null, token, null, args, function (error, response) {
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
							changed= true;
						}
						found++;
						j=editRecords.length;
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
					var argsJson = {domainname:domainname, record:recordJson, id:editRecords[i].id, dbUsername:server.dbUsername, dbPassword: server.dbPassword};
					var args=JSON.stringify(argsJson);
					rest.postOperation("http://"+server.servername, "records/edit", null, token, null, args, function (error, response) {
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
		var args="{\"domainname\":\""+domainname+"\",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		rest.postOperation("http://"+server.servername, "records/list", null, token, null, args, function (error, response) {
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
							changedRecords.push(records[i]);
						}
						found++;
						j=editRecords.length;
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
					var argsJson = {domainname:domainname, id:editRecords[i].id, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
					var args=JSON.stringify(argsJson);
					rest.postOperation("http://"+server.servername, "records/edit", null, token, null, args, function (error, response) {
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

		
		var addCount = 0;
		
		for(var i =0; i < newRecords.length;++i){
			
			var recordJson = { 
					name: newRecords[i].name, 
					type: newRecords[i].type,
					content: newRecords[i].content,
					ttl: newRecords[i].ttl,
				};
			var argsJson = {domainname:domainname, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
			var args = JSON.stringify(argsJson);
			rest.postOperation("http://"+server.servername, "records/add", null, token, null, args, function (error, response) {
				if (error) {
					var arrMsg = error.split(' ');
					if(arrMsg[0] !== 'Duplicate' || arrMsg[1] !== 'entry'){
						return callback(error);
					}
				}
				addCount++;
				if(addCount === newRecords.length){
					return callback(null);
				}
			});
		}
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
			
			var argsJson = {domainname:domainname, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
			var args=JSON.stringify(argsJson);
			rest.postOperation("http://"+server.servername, "records/remove", null, token, null, args, function (error, response) {
				if (error) {
			       	return callback(error);
				}
				if(record){
					Domain.get(domainname, function(err, domain){
						if(err){
							return callback(err);
						}
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
			var args="{\"domainname\":\""+domainname+"\",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
			rest.postOperation("http://"+server.servername, "records/list", null, token, null, args, function (error, response) {
				if (error) {
			       	return callback(error);
				}
				var records = response.records;
				var found = 0;
				if(records.length > 0){
					for(var i = 0; i< records.length; ++i){

						var recordJson = {name:records[i].name, type:records[i].type, content: records[i].content};
						var argsJson = {domainname:domainname, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
						var args=JSON.stringify(argsJson);
						rest.postOperation("http://"+server.servername, "records/remove", null, token, null, args, function (error, response) {
							if (error) {
						       	return callback(error);
							}
							++found;
							if(found === records.length){
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
			        	
						if(delegatedRecords.length){

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
								var argsJson = {domainname:domainname, record:recordJson, dbUsername:server.dbUsername, dbPassword:server.dbPassword};
								var args=JSON.stringify(argsJson);
								rest.postOperation("http://"+server.servername, "records/remove", null, token, null, args, function (error, response) {
									if (error) {
								       	return callback(error);
									}
									++count;
									
									if(count === records.length){
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


// Creates the domain and persists (saves) it to the db, incl. indexing it:
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
            // TODO: This assumes domainname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the domainname is taken or not.
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

// Static initialization:

// Register our unique domainname constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Domain',
    property: 'domainname',
}, function (err, constraint) {
    if (err) {
    	throw err;     // Failing fast for now, by crash the application.
    }
    if (constraint) {
        console.log('(Registered unique domainnames constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
});
