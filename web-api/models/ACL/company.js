// company.js
// Company model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Server = require('./server');
var Domain = require('./domain');
var config = require('../../config/conf.json');
var cachedb = require('../cachedb')
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;


var db = new neo4j.GraphDatabase({
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Company = module.exports = function Company(_node) {
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

Object.defineProperty(Company.prototype, 'companyname', {
    get: function () { return this._node.properties['companyname']; }
});

// Private helpers:
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

        self._node = results[0]['company'];

        callback(null);
    });
};

Company.prototype.del = function (callback) {
    
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
	//TODO: Modify this function by referring 'un_manage' function which deletes multiple objects at once 
	var companyname = this.companyname;
	
    var query = [
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (domain)-[:have]->(record:Record)',
        'DETACH DELETE record', //remove records and relationships
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
            'DETACH DELETE domain', //remove domains and relationships
        ].join('\n');

        var params2 = {
        	thisCompanyname: companyname,
            otherDomainname: other.domainname,
        };

        db.cypher({
            query: query2,
            params: params2,
        }, function (err) {
        	//TODO: Consider when records are removed but domains exist 
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
    		callback(null,{result: 'yes'}); //Owner company of domain
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
    		callback(null,{result: 'yes'}); //Manager company of server
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};


Company.prototype.delegator_of = function (other, callback) {
	//TODO: Change function name to 'delegatee_of'
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
	//TODO: Change function name to 'un_delegatee_of'
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
	//TODO: Change function name to 'isDelegateeOf'
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
    		callback(null,{result: 'yes'}); //Delegatee company of domain
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
    		callback(null,{result: 'yes'}); //Delegatee company of any domain mapped by server
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
    	if(res[0]){
    		callback(null,{result: 'yes', bound: res[0].rel.properties.bound}); //Delegatee company of domain with bound
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
        'RETURN others.username, COUNT(rel), COUNT(rel1), COUNT(rel2)', 
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
        // 'results' includes all users and thier relationships with company
        var administrators = [];
        var employees = [];
        var requests = [];
        var others = [];

        for (var i = 0; i < results.length; i++) {
            var other = results[i]['others.username'];
            var employee = results[i]['COUNT(rel)'];
            var administrator = results[i]['COUNT(rel1)'];
            var request = results[i]['COUNT(rel2)'];
            
            if (request) { //user who requests becoming administrator
            	requests.push(other);
            }
            if (administrator) { //administrator user of company
            	administrators.push(other);
            } else if (employee) { //employee user of company
            	employees.push(other);
            }
            if (!request && !administrator && !employee)
            { // user not related to company
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
	//TODO: This function is not used now but leave it. It may be used later. 
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

    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})-[:owner_of]->(domain:Domain)',
        'RETURN domain', 
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
        	var domain = new Domain(results[i]['domain']);
        	if(!domain.domainname) {
        		return callback("Domain exists, but its domainname does not exist"); //This should not occur
        	}
        	domains.push(domain.domainname); //domain list that company owns
        }
        callback(null, domains);
    });
};

Company.getManage = function (companyname, callback) {
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})-[:manage]->(server:Server)',
        'RETURN server', 
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
        		return callback("Server exists, but its servername does not exist"); //This should not occur
        	}
        	servers.push(server.servername); //Server list that company manages
        }
        callback(null, servers);
    });
};


Company.getCompanyOwnerOfDomain = function (companyname, domainname, callback) {
	cachedb.loadCachedData(companyname+':'+domainname, function(err, results){
		if(results && JSON.parse(results).authority){
			cachedb.setExpire(companyname+':'+domainname, config.REDIS_DEFAULT_EXPIRE);
			return callback(null, JSON.parse(results).authority);
		}
	    var query = [
	        'MATCH (domain:Domain {domainname: {thisDomainname}})',
	        'MATCH (company:Company {companyname: {thisCompanyname}})',
	        'OPTIONAL MATCH (company)-[rel1:owner_of]->(domain)',
	        'OPTIONAL MATCH (domain)-[rel2:delegate]->(company)',
	        'RETURN company, COUNT(rel1), COUNT(rel2)', 
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
	        if(!results[0]){
	        	return callback('There is no company having authority to domain'); //This should not occur
	        }
	
	        var companiesOwnerOf = [];
	        var companiesDelegated = [];
	
	        for (var i = 0; i < results.length; i++) {
	        	if(results[i]['COUNT(rel1)']){
	        		companiesOwnerOf.push(results[i]['company']); //Owner of domain
	        	} else if(results[i]['COUNT(rel2)']){
	        		companiesDelegated.push(results[i]['company']); //Delegatee of domain
	        	}
	        }
	        var company;
	        if(companiesOwnerOf.length){
		    	cachedb.cacheDataWithExpire(companyname+':'+domainname, JSON.stringify({authority:"owner"}), config.REDIS_DEFAULT_EXPIRE);
	            return callback(null, "owner");	
	        } else if(companiesDelegated.length){
		    	cachedb.cacheDataWithExpire(companyname+':'+domainname, JSON.stringify({authority:"delegator"}), config.REDIS_DEFAULT_EXPIRE);
	            return callback(null, "delegator");	
	        } else {
		    	cachedb.cacheDataWithExpire(companyname+':'+domainname, JSON.stringify({authority:"no"}), config.REDIS_DEFAULT_EXPIRE);
	        	return callback(null, "no");
	        }
	    });
	});
};

Company.getDelegateManage = function (companyname, callback) {

    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})<-[:delegate]-(:Domain)<-[:map]-(server:Server)',
        'RETURN DISTINCT server', 
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
        		return callback("Server exists, but its servername does not exist"); //This should not occur
        	}
        	servers.push(server.servername); //Server whose domains have delegate authority with company
        }
        callback(null, servers);
    });
};


Company.deleteDelegatorOfbyDomain = function (companyname, domainname, callback) {
	//TODO: Change function name to 'deleteDelgateeOfbyDomain'
    var query = [
        'MATCH (company:Company {companyname: {thisCompanyname}})',
        'MATCH (domain:Domain {domainname:{thisDomainname}})',
        'MATCH (company)-[:delegator_of]->(record:Record)<-[:have]-(domain)',
        'DETACH DELETE record',
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
	//TODO: this function is not used now but leave it. It may be used later.
     var query = [
        'MATCH (:Company {companyname: {thisCompanyname}})-[:owner_of]->(:Domain {domainname: {thisDomainname}})<-[:map]-(server:Server)',
        'RETURN server', 
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
	//Make 'owner_of' relationship between company and multiple domains at once
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


Company.getAll= function (callback) {
    var query = [
        'MATCH (company:Company)',
        'RETURN company', 
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
        callback(null, companies); //return all companies' names
    });
};


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