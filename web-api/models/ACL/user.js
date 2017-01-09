// user.js
// User model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Company = require('./company');
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

var User = module.exports = function User(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
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

// The user's username, e.g. 'aseemk'.
Object.defineProperty(User.prototype, 'username', {
    get: function () { return this._node.properties['username']; }
});

// Private helpers:

//Validates the given property based on the validation info above.
//By default, ignores null/undefined/empty values, but you can pass `true` for
//the `required` param to enforce that any required properties are present.
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

// Takes the given caller-provided properties, selects only known ones,
// validates them, and returns the known subset.
// By default, only validates properties that are present.
// (This allows `User.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `User.create`.)
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

// Atomically updates this user, both locally and remotely in the db, with the
// given property updates.
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
            // TODO: This assumes username is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the username is taken or not.
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

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['user'];

        callback(null);
    });
};

User.prototype.del = function (callback) {
    // Use a Cypher query to delete both this user and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    
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


/*User.prototype.isManaging = function (other, callback) {
    var query = [
        'MATCH (user:User {username: {thisUsername}})',
        'MATCH (other:Server{servername: {otherServername}})',
        'MATCH (user)-[:ons_administrator_of]->(:Company)-[rel:manage]-> (other)',
        'RETURN rel',
    ].join('\n');

    var params = {
    	thisUsername: this.username,
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
};*/


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
    		callback(null,{result: 'yes'});
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

    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)\
        -[:owner_of]->(domain:Domain)',
        'RETURN domain', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var domain = new Domain(results[i]['domain']);
        	if(!domain.domainname) {
        		return callback("Domain exists, but its domainname does not exist");
        	}
        	domains.push(domain.domainname);
        	//var things = new thing.Thing(results[i]['thing']);
            //ownerships.push(things.gs1code);
        	//var users = new User(results[i]['thing']);
        	//ownerships.push(users.username);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, domains);
    });
};



User.getDelegateDomains = function (username, callback) {

    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)\
        -[:delegator_of]->(:Record)<-[:have]-(domain:Domain)',
        'RETURN domain', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var domain = new Domain(results[i]['domain']);
        	if(!domain.domainname) {
        		return callback("Domain exists, but its domainname does not exist");
        	}
        	domains.push(domain.domainname);
        	//var things = new thing.Thing(results[i]['thing']);
            //ownerships.push(things.gs1code);
        	//var users = new User(results[i]['thing']);
        	//ownerships.push(users.username);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, domains);
    });
};


User.getCompanies = function (username, callback) {

    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:enployee_of]->(company:Company)',
        'RETURN company', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var company = new Company(results[i]['company']);
        	if(!company.companyname) {
        		return callback("Company exists, but its companyname does not exist");
        	}
        	companies.push(company.companyname);
        	//var things = new thing.Thing(results[i]['thing']);
            //ownerships.push(things.gs1code);
        	//var users = new User(results[i]['thing']);
        	//ownerships.push(users.username);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, companies);
    });
};


User.getManage = function (username, callback) {

    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(:Company)-[:manage]->(server:Server)',
        'RETURN server', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var server = new Server(results[i]['server']);
        	if(!server.servername) {
        		return callback("Server exists, but its servername does not exist");
        	}
        	servers.push(server.servername);
        }
        callback(null, servers);
    });
};

User.getDelegateManage = function (username, callback) {
    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (user:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
        'MATCH (company)<-[:delegate]-(:Domain)<-[:map]-(server:Server)',
        'RETURN server', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var server = new Server(results[i]['server']);
        	if(!server.servername) {
        		return callback("Server exists, but its servername does not exist");
        	}
        	servers.push(server.servername);
        }
        callback(null, servers);
    });

};


User.getCompanyManagingServer = function (username, servername, callback) {
    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
        'MATCH (server:Server {servername: {thisServername}})',
        'OPTIONAL MATCH (company)-[rel1:manage]->(server)',
        'OPTIONAL MATCH (company)<-[rel2:delegate]-(:Domain)<-[:map]-(server)',
        'RETURN company, COUNT(rel1), COUNT(rel2)', // COUNT(rel) is a hack for 1 or 0
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


User.getCompanyOwnerOfDomain = function (username, domainname, callback) {
    // Query all users and whether we follow each one or not:
    var query = [
        'MATCH (domain:Domain {domainname: {thisDomainname}})',
        'MATCH (:User {username: {thisUsername}})-[:ons_administrator_of]->(company:Company)',
        'OPTIONAL MATCH (company)-[rel1:owner_of]->(domain)',
        'OPTIONAL MATCH (domain)-[rel2:delegate]->(company)',
        'RETURN company, COUNT(rel1), COUNT(rel2)', // COUNT(rel) is a hack for 1 or 0
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
            //, function(err,thing){
            //	if(thing)
        	var company = new Company(results[i]['company']);
        	var OwnerOf = results[i]['COUNT(rel1)'];
    		var Delegated = results[i]['COUNT(rel2)'];
        	if(!company.companyname) {
        		return callback("Company exists, but its companyname does not exist");
        	}
        	if(OwnerOf){
        		companiesOwnerOf.push(company);
        	} else if(Delegated){
        		companiesDelegated.push(company);
        	}
        }
        if(companiesOwnerOf.length){
            return callback(null, companiesOwnerOf[0]);	
        } else if(companiesDelegated.length){
            return callback(null, companiesDelegated[0]);	
        }
    	return callback('There is no company owner of or delegated domain: '+domainname);
    });

};



// Creates the user and persists (saves) it to the db, incl. indexing it:
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
            // TODO: This assumes username is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the username is taken or not.
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

/*
// Static initialization:

// Register our unique username constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'User',
    property: 'username',
}, function (err, constraint) {
    if (err) {
    	throw err;     // Failing fast for now, by crash the application.
    }
    if (constraint) {
        console.log('(Registered unique usernames constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
});
*/