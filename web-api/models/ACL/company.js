// company.js
// Company model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Server = require('./server');
var Domain = require('./domain');
var config = require('../../config/conf.json');
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;


var db = new neo4j.GraphDatabase({
    // Support specifying database info via environment variables,
    // but assume Neo4j installation defaults.
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Company = module.exports = function Company(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
    this._node = _node;
};

// Public constants:

Company.VALIDATION_INFO = {
    'companyname': {
        required: true,
        minLength: 2,
        maxLength: 25,
        pattern: /^[A-Za-z0-9_@.]+$/,
        message: '2-25 characters; letters, numbers, underscores, \'.\', and \'@\' only.'
    },
};

// Public instance properties:

// The company's companyname, e.g. 'aseemk'.
Object.defineProperty(Company.prototype, 'companyname', {
    get: function () { return this._node.properties['companyname']; }
});

// Private helpers:

//Validates the given property based on the validation info above.
//By default, ignores null/undefined/empty values, but you can pass `true` for
//the `required` param to enforce that any required properties are present.
function validateProp(prop, val, required) {
 var info = Company.VALIDATION_INFO[prop];
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
// (This allows `Company.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Company.create`.)
function validate(props, required) {
    var safeProps = {};

    for (var prop in Company.VALIDATION_INFO) {
    	if(Company.VALIDATION_INFO.hasOwnProperty(prop)){
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

// Atomically updates this company, both locally and remotely in the db, with the
// given property updates.
Company.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (company:Company {companyname: {companyname}})',
        'SET company += {props}',
        'RETURN company',
    ].join('\n');

    var params = {
        companyname: this.companyname,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes companyname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the companyname is taken or not.
            err = new errors.ValidationError(
                'The companyname ‘' + props.companyname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }

        if (!results.length) {
            err = new Error('Company has been deleted! Companyname: ' + self.companyname);
            return callback(err);
        }

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['company'];

        callback(null);
    });
};

Company.prototype.del = function (callback) {
    // Use a Cypher query to delete both this company and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    
	var query = [
	   'MATCH (company:Company {companyname: {thisCompanyname}})',
	   'MATCH (company)-[:owner_of]->(domain)',
	   'MATCH (domain)-[:have]->(record)',
	   'DETACH DELETE company, domain, record'
	   
	].join('\n');

    var params = {
        thisCompanyname: this.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Company.prototype.owner_of = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Domain {domainname: {otherDomainname}})',
        'MERGE (company) -[rel:owner_of]-> (other)',
    ].join('\n');

    var params = {
        thisCompanyname: this.companyname,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Company.prototype.un_owner_of = function (other, callback) {
	var companyname = this.companyname;
	
    var query = [
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (domain)-[:have]->(record:Record)',
        'DETACH DELETE record',
    ].join('\n');

    var params = {
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
    	if(err){
    		callback(err);
    	}

        var query2 = [
            'MATCH (company:Company {companyname: {thisCompanyname}})',
            'MATCH (domain:Domain {domainname: {otherDomainname}})',
            'MATCH (company)-[:owner_of]->(domain)',
            'DETACH DELETE domain',
        ].join('\n');

        var params2 = {
        	thisCompanyname: companyname,
            otherDomainname: other.domainname,
        };

        db.cypher({
            query: query2,
            params: params2,
        }, function (err) {
        	callback(err);
        });
    	
    	
    });
};


Company.prototype.is_owner_of = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (company)-[rel:owner_of]->(domain)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, res) {
    	if(err){
    		return callback(err);
    	}
    	if(res[0]){
    		callback(null,{result: 'yes'});
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};



Company.prototype.manage = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Server{servername: {otherServername}})',
        'MERGE (company) -[rel:manage]-> (other)',
    ].join('\n');

    var params = {
        thisCompanyname: this.companyname,
        otherServername: other.servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Company.prototype.un_manage = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Server{servername: {otherServername}})',
        'MATCH (company) -[:manage]-> (other)',
        'OPTIONAL MATCH (other) -[:map]-> (domain:Domain)',
        'OPTIONAL MATCH (domain) -[:have]-> (record:Record)',
        'DETACH DELETE other, domain, record',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherServername: other.servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};


Company.prototype.isManaging = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Server{servername: {otherServername}})',
        'MATCH (company) -[rel:manage]-> (other)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherServername: other.servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, res) {
    	if(err){
    		return callback(err);
        }
    	if(res[0]){
    		callback(null,{result: 'yes'});
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};


Company.prototype.delegator_of = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Record {recordname: {otherRecordname}})',
        'MERGE (company) -[rel:delegator_of]-> (other)',
    ].join('\n');

    var params = {
        thisCompanyname: this.companyname,
        otherRecordname: other.recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Company.prototype.un_delegator_of = function (other, callback) {
	var companyname = this.companyname;
	
    var query = [
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (domain)-[:have]->(record:Record)<-[:deletator_of]-(company)',
        'DETACH DELETE record',
    ].join('\n');

    var params = {
        thisCompanyname: other.companyname,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
    	callback(err);  	
    });
};


Company.prototype.isDelegatorOf = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Record{recordname: {otherRecordname}})',
        'MATCH (company)-[rel:delegator_of]-> (other)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherRecordname: other.recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, res) {
    	if(err){
    		return callback(err);
        }
    	if(res[0]){
    		callback(null,{result: 'yes'});
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};




Company.prototype.isDelegatedByServer = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Server{servername: {otherServername}})',
        'MATCH (other) -[:map]->(:Domain)-[rel:delegate]-> (company)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherServername: other.servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, res) {
    	if(err){
    		return callback(err);
        }
    	if(res[0]){
    		callback(null,{result: 'yes'});
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};



Company.prototype.isDelegatedByDomain = function (other, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (other:Domain{domainname: {otherDomainname}})',
        'MATCH (other) -[rel:delegate]-> (company)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisCompanyname: this.companyname,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, res) {
    	if(err){
    		return callback(err);
        }
    	console.log(res[0].rel.properties.bound);
    	if(res[0]){
    		callback(null,{result: 'yes', bound: res[0].rel.properties.bound});
    	} else{
    		callback(null,{result: 'no', bound: -1});
    	}
    });
};




Company.prototype.getAdministratorAndOthers = function (callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (others:User)',
        'OPTIONAL MATCH (company) <-[rel:employee_of]- (others)',
        'OPTIONAL MATCH (company) <-[rel1:ons_administrator_of]- (others)',
        'OPTIONAL MATCH (company) <-[rel2:request]- (others)',
        'RETURN others.username, COUNT(rel), COUNT(rel1), COUNT(rel2)', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: this.companyname,
    };
    
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var administrators = [];
        var employees = [];
        var requests = [];
        var others = [];

        for (var i = 0; i < results.length; i++) {
            var other = results[i]['others.username'];
            var employee = results[i]['COUNT(rel)'];
            var administrator = results[i]['COUNT(rel1)'];
            var request = results[i]['COUNT(rel2)'];
            if (request) {
            	requests.push(other);
            }
            if (administrator) {
            	administrators.push(other);
            } else if (employee) {
            	employees.push(other);
            }
            if (!request && !administrator && !employee)
            {
            	others.push(other);
            }
        }
        callback(null, employees, administrators, requests, others);
    });
};

Company.get = function (companyname, callback) {
    var query = [
        'MATCH (company:Company {companyname: {companyname}})',
        'RETURN company',
    ].join('\n');

    var params = {
        companyname: companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            err = new Error('No such company with companyname: ' + companyname);
            return callback(err);
        }
        var company = new Company(results[0]['company']);
        callback(null, company);
    });
};

Company.getMy = function (companyname, callback) {
    var query = [
        'MATCH (company:Company {companyname: {companyname}})',
        'RETURN company',
    ].join('\n');

    var params = {
        companyname: companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            err = new Error('No such company with companyname: ' + companyname);
            return callback(err);
        }
        var company = new Company(results[0]['company']);
        callback(null, company);
    });
};



Company.getOwnerOf = function (companyname, callback) {

    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})-[:owner_of]->(domain:Domain)',
        'RETURN domain', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var domains = [];

        for (var i = 0; i < results.length; i++) {
            //, function(err,domain){
            //	if(domain)
        	var domain = new Domain(results[i]['domain']);
        	if(!domain.domainname) {
        		return callback("Domain exists, but its domainname does not exist");
        	}
        	domains.push(domain.domainname);
        	//var domains = new domain.Domain(results[i]['domain']);
            //ownerships.push(domains.gs1code);
        	//var companys = new Company(results[i]['domain']);
        	//ownerships.push(companys.companyname);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, domains);
    });
};

Company.getManage = function (companyname, callback) {

    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})-[:manage]->(server:Server)',
        'RETURN server', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
    };

    var company = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var servers = [];

        for (var i = 0; i < results.length; i++) {
            //, function(err,thing){
            //	if(thing)
        	var server = new Server(results[i]['server']);
        	if(!server.servername){
        		return callback("Server exists, but its servername does not exist");
        	}
        	servers.push(server.servername);
        	//var things = new thing.Domain(results[i]['thing']);
            //ownerships.push(things.gs1code);
        	//var companys = new Company(results[i]['thing']);
        	//ownerships.push(companys.companyname);
        }
        console.log(servers);
        callback(null, servers);
    });
};


Company.getDelegateManage = function (companyname, callback) {

    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})<-[:delegate]-(:Domain)<-[:map]-(server:Server)',
        'RETURN DISTINCT server', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
    };

    var company = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var servers = [];

        for (var i = 0; i < results.length; i++) {
        	var server = new Server(results[i]['server']);
        	if(!server.servername){
        		return callback("Server exists, but its servername does not exist");
        	}
        	servers.push(server.servername);
        }
        callback(null, servers);
    });
};


Company.deleteDelegatorOfbyDomain = function (companyname, domainname, callback) {

    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (domain:Domain {domainname:{thisDomainname}})',
        'MATCH (company)-[:delegator_of]->(record:Record)<-[:have]-(domain)',
        'DETACH DELETE record', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
    };

    var company = this;
    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        callback(null);
    });
};



Company.getServerMappingDomain = function (companyname, domainname, callback) {
    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (:Company {companyname: {thisCompanyname}})-[:owner_of]->(:Domain {domainname: {thisDomainname}})<-[:map]-(server:Server)',
        'RETURN server', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
        thisDomainname: domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results[0]){
        	return callback("There is no server matching with company: "+companyname);
        }
    	var server = new Server(results[0]['server']);
        callback(null, server);
    });
	   
};



Company.ownerOfDomains = function (companyname, domainnames, callback) {
	
	if(domainnames.length){
		Company.get(companyname, function(err, company){
			if(err) {
				return callback(err);
			}
			domainnames.forEach(function (a, idx, array) {
				Domain.get(a, function(err, domain){
					if(err) {
						return callback(err);
					}
					company.owner_of(domain, function(err){
						if(err) {
							return callback(err);
						}
						if(idx === array.length -1) {
							return callback(null);
						}
					});
				});
			});
		});
	} else{
		return callback(null);
	}
};


/*Company.removeDomainAndOwnerOf = function (companyname, servername, domainname, callback) {
	Company.get(companyname, function(err, company){
		if(err){
			return callback(err);
		}
		Server.get(servername, function(err, server){
			if(err){
				return callback(err);
			}
				
			var pdns_config = {
					  adapter: "mysql",
					  db: "powerdns",
					  user: server.dbUsername,
					  password: server.dbPassword,
					  host: server.servername
					};
		
			var pdns = require('pdns')(pdns_config);
			
			pdns.domains.remove({name:domainname},{},function(err, res){
				if(err){
					return callback(err);
				}
				Domain.get(domainname, function(err, domain){
					if(err){
						return callback(err);
					}
					company.un_owner_of(domain, function(err){
						return callback(err);
					});
				});
			});
		});
	});
};*/


Company.getAll= function (callback) {
    var query = [
        'MATCH (company:Company)',
        'RETURN company', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');


    db.cypher({
        query: query,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }

        var companies = [];

        for (var i = 0; i < results.length; i++) {
        	var company = new Company(results[i]['company']);
        	companies.push(company.companyname);
        }
        callback(null, companies);
    });
};


// Creates the company and persists (saves) it to the db, incl. indexing it:
Company.create = function (props, callback) {
    var query = [
        'CREATE (company:Company {props})',
        'RETURN company',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes companyname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the companyname is taken or not.
            err = new errors.ValidationError(
                'The companyname ‘' + props.companyname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }
        var company = new Company(results[0]['company']);
        callback(null, company);
    });
};

/*
// Static initialization:

// Register our unique companyname constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Company',
    property: 'companyname',
}, function (err, constraint) {
    if (err) {
    	throw err;     // Failing fast for now, by crash the application.
    }
    if (constraint) {
        console.log('(Registered unique companynames constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
});
*/