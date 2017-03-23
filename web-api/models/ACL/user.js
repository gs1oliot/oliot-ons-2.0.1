// user.js
// User model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Company = require('./company');
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

var User = module.exports = function User(_node) {
    this._node = _node;
};

// Public constants:

User.VALIDATION_INFO = {
    'username': {
        required: true,
        minLength: 2,
        maxLength: 25,
        pattern: /^[A-Za-z0-9_@.]+$/,
        message: '2-25 characters; letters, numbers, underscores, \'.\', and \'@\' only.'
    },
};

// Public instance properties:

Object.defineProperty(User.prototype, 'username', {
    get: function () { return this._node.properties['username']; }
});

// Private helpers:

function validateProp(prop, val, required) {
 var info = User.VALIDATION_INFO[prop];
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

    for (var prop in User.VALIDATION_INFO) {
    	if(User.VALIDATION_INFO.hasOwnProperty(prop)){
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
User.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (user:User {username: {username}})',
        'SET user += {props}',
        'RETURN user',
    ].join('\n');

    var params = {
        username: this.username,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            err = new errors.ValidationError(
                'The username ‘' + props.username + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }

        if (!results.length) {
            err = new Error('User has been deleted! Username: ' + self.username);
            return callback(err);
        }

        self._node = results[0]['user'];

        callback(null);
    });
};

User.prototype.del = function (callback) {
    
	var query = [
	   'MATCH (user:User {username: {thisUsername}})',
	   'DETACH DELETE user'
	   
	].join('\n');

    var params = {
        thisUsername: this.username,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

User.prototype.employee_of = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (other:Company {companyname: {otherCompanyname}})',
        'MERGE (user) -[rel:employee_of]-> (other)',
    ].join('\n');

    var params = {
        thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

User.prototype.un_employee_of = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (company:Company {companyname: {otherCompanyname}})',
        'MATCH (user)-[rel:employee_of]->(company)',
        'DELETE rel',
    ].join('\n');

    var params = {
    	thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};


User.prototype.ons_administrator_of = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (other:Company {companyname: {otherCompanyname}})',
        'MERGE (user) -[rel:ons_administrator_of]-> (other)',
        'MERGE (user) -[rel1:employee_of]-> (other)',
    ].join('\n');

    var params = {
        thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

User.prototype.un_ons_administrator_of = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (company:Company {companyname: {otherCompanyname}})',
        'MATCH (user)-[rel:ons_administrator_of]->(company)',
        'DELETE rel',
    ].join('\n');

    var params = {
    	thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};


User.prototype.is_owner_of = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (user)-[ons_administrator_of]->(:Company)-[rel:owner_of]->(domain)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisUsername: this.username,
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
    		callback(null,{result: 'yes'}); //Owner user of domain
    	} else{
    		callback(null,{result: 'no'});
    	}
    });
};


User.prototype.request = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (other:Company {companyname: {otherCompanyname}})',
        'MERGE (user) -[rel:request]-> (other)',
    ].join('\n');

    var params = {
        thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

User.prototype.un_request = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (company:Company {companyname: {otherCompanyname}})',
        'MATCH (user)-[rel:request]->(company)',
        'DELETE rel',
    ].join('\n');

    var params = {
    	thisUsername: this.username,
        otherCompanyname: other.companyname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

User.get = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {username}})',
        'RETURN user',
    ].join('\n');

    var params = {
        username: username,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            err = new Error('No such user with username: ' + username);
            return callback(err);
        }
        var user = new User(results[0]['user']);
        callback(null, user);
    });
};



User.getMyDomains = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)\
        -[:owner_of]->(domain:Domain)',
        'RETURN domain', 
    ].join('\n');

    var params = {
        thisUsername: username,
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
        		return callback("Domain exists, but its domainname does not exist");//This should not occur
        	}
        	domains.push(domain.domainname);
        }
        callback(null, domains);
    });
};



User.getDelegateDomains = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)\
        -[:delegator_of]->(:Record)<-[:have]-(domain:Domain)',
        'RETURN domain',
    ].join('\n');

    var params = {
        thisUsername: username,
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
        	domains.push(domain.domainname);
        }
        callback(null, domains);
    });
};


User.getCompanies = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:enployee_of]->(company:Company)',
        'RETURN company', 
    ].join('\n');

    var params = {
        thisUsername: username,
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
        		return callback("Company exists, but its companyname does not exist"); //This should not occur
        	}
        	companies.push(company.companyname);
        }
        callback(null, companies);
    });
};


User.getManage = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)-[:manage]->(server:Server)',
        'RETURN server', 
    ].join('\n');

    var params = {
        thisUsername: username,
    };

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
        	if(!server.servername) {
        		return callback("Server exists, but its servername does not exist"); //This should not occur
        	}
        	servers.push(server.servername);
        }
        callback(null, servers);
    });
};

User.getDelegateManage = function (username, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
        'MATCH (company)<-[:delegate]-(:Domain)<-[:map]-(server:Server)',
        'RETURN DISTINCT server',
    ].join('\n');

    var params = {
        thisUsername: username,
    };

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
        	if(!server.servername) {
        		return callback("Server exists, but its servername does not exist"); //This should not occur
        	}
        	servers.push(server.servername);
        }
        callback(null, servers);
    });

};


User.getCompanyManagingServer = function (username, servername, callback) {
    var query = [
        'MATCH (:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
        'MATCH (server:Server {servername: {thisServername}})',
        'OPTIONAL MATCH (company)-[rel1:manage]->(server)',
        'OPTIONAL MATCH (company)<-[rel2:delegate]-(:Domain)<-[:map]-(server)',
        'RETURN company, COUNT(rel1), COUNT(rel2)',
    ].join('\n');

    var params = {
        thisUsername: username,
        thisServername: servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if(!results[0]){
        	return callback('There is no company managing server: '+servername);
        }
        
        var companies=[];
        
        for (var i = 0; i < results.length; i++) {
        	var company = new Company(results[i]['company']);
        	if(results[i]['COUNT(rel1)']||results[i]['COUNT(rel2)']){
        		companies.push(company);
        	}
        }
        
        if(companies.length !== 1){
        	return callback('There is multiple companies managing server: '+servername);
        }
        
        callback(null, companies[0]);
    });

};

User.getCompanyAdministratorOf =  function (username, callback){
	cachedb.loadCachedData(username+':employeeOf', function(err, results){
		if(results && JSON.parse(results).company){
			cachedb.setExpire(username+':employeeOf', config.REDIS_DEFAULT_EXPIRE);
	        return callback(null, JSON.parse(results).company);	
		}
	    var query = [
	        'MATCH (:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
	        'RETURN company.companyname', 
	    ].join('\n');
	
	    var params = {
	        thisUsername: username,
	    };
	
	    db.cypher({
	        query: query,
	        params: params,
	    }, function (err, results) {
	        if (err) {
	        	return callback(err);
	        }
	        if(!results[0]){
	        	return callback('There is no company where you are administor');
	        }
	
	    	cachedb.cacheDataWithExpire(username+':employeeOf', JSON.stringify({company:results[0]['company.companyname']}), config.REDIS_DEFAULT_EXPIRE);
	        return callback(null, results[0]['company.companyname']);
	    });
	});
};


User.getCompanyOwnerOfDomain = function (username, domainname, callback) {
	cachedb.loadCachedData(username+':'+domainname, function(err, results){
		if(results && JSON.parse(results).authority){
			cachedb.setExpire(username+':'+domainname, config.REDIS_DEFAULT_EXPIRE);
			return callback(null, JSON.parse(results).authority);
		}
	    var query = [
	        'MATCH (domain:Domain {domainname: {thisDomainname}})',
	        'MATCH (:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
	        'OPTIONAL MATCH (company)-[rel1:owner_of]->(domain)',
	        'OPTIONAL MATCH (domain)-[rel2:delegate]->(company)',
	        'RETURN company, COUNT(rel1), COUNT(rel2)',
	    ].join('\n');
	
	    var params = {
	        thisUsername: username,
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
	        	return callback('There is no company where you are administor');
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
		    	cachedb.cacheDataWithExpire(username+':'+domainname, JSON.stringify({authority:"owner"}), config.REDIS_DEFAULT_EXPIRE);
	        	company = new Company(companiesOwnerOf[0]); 
	            return callback(null, company , "owner");	
	        } else if(companiesDelegated.length){
		    	cachedb.cacheDataWithExpire(username+':'+domainname, JSON.stringify({authority:"delegator"}), config.REDIS_DEFAULT_EXPIRE);
	        	company = new Company(companiesDelegated[0]); 
	            return callback(null, company, "delegator");	
	        } else {
		    	cachedb.cacheDataWithExpire(username+':'+domainname, JSON.stringify({authority:"no"}), config.REDIS_DEFAULT_EXPIRE);
	        	return callback(null);
	        }
	    });
	});
};



User.create = function (props, callback) {
    var query = [
        'CREATE (user:User {props})',
        'RETURN user',
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
                'The username ‘' + props.username + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }
        var user = new User(results[0]['user']);
        callback(null, user);
    });
};
