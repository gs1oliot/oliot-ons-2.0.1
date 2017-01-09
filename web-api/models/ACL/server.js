// server.js
// Server model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Domain = require('./domain');
var config = require('../../config/conf.json');
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

var Server = module.exports = function Server(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
    this._node = _node;
};

// Public constants:

Server.VALIDATION_INFO = {
    'servername': {
        required: true,
        minLength: 2,
        maxLength: 25,
        pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\:[0-9]{1,5}$/,
        message: 'IP address only'
    },
    'dbUsername': {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: /^[A-Za-z]+$/,
        message: '2-50 characters; letters only.'
    },
    'dbPassword': {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: /^[A-Za-z0-9_@.]+$/,
        message: '2-50 characters; letters, numbers, underscores, \'.\', and \'@\' only.'
    }
};

// Public instance properties:

// The server's servername, e.g. 'aseemk'.
Object.defineProperty(Server.prototype, 'servername', {
    get: function () { return this._node.properties['servername']; }
});

Object.defineProperty(Server.prototype, 'dbUsername', {
    get: function () { return this._node.properties['dbUsername']; }
});

Object.defineProperty(Server.prototype, 'dbPassword', {
    get: function () { return this._node.properties['dbPassword']; }
});

// Private helpers:

//Validates the given property based on the validation info above.
//By default, ignores null/undefined/empty values, but you can pass `true` for
//the `required` param to enforce that any required properties are present.
function validateProp(prop, val, required) {
 var info = Server.VALIDATION_INFO[prop];
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
// (This allows `Server.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Server.create`.)
function validate(props, required) {
    var safeProps = {};

    for (var prop in Server.VALIDATION_INFO) {
    	if(Server.VALIDATION_INFO.hasOwnProperty(prop)){
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

// Atomically updates this server, both locally and remotely in the db, with the
// given property updates.
Server.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (server:Server {servername: {servername}})',
        'SET server += {props}',
        'RETURN server',
    ].join('\n');

    var params = {
        servername: this.servername,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes servername is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the servername is taken or not.
            err = new errors.ValidationError(
                'The servername ‘' + props.servername + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }

        if (!results.length) {
            err = new Error('Server has been deleted! Servername: ' + self.servername);
            return callback(err);
        }

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['server'];

        callback(null);
    });
};

Server.prototype.del = function (callback) {
    // Use a Cypher query to delete both this server and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    
	var query = [
	   'MATCH (server:Server {servername: {thisServername}})',
	   'DETACH DELETE server'
	   
	].join('\n');

    var params = {
        thisServername: this.servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Server.prototype.map = function (other, callback) {
    var query = [
        'MATCH (server:Server {servername: {thisServername}})',
        'MATCH (other:Domain {domainname: {otherDomainname}})',
        'MERGE (server) -[rel:map]-> (other)',
    ].join('\n');

    var params = {
        thisServername: this.servername,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};


Server.prototype.un_map = function (other, callback) {
	
	var servername = this.servername;
	
    var query = [
        'MATCH (server:Server {servername: {thisServername}})',
        'MATCH (domain:Domain {domainname: {otherDomainname}})',
        'MATCH (server)-[:map]->(domain)',
        'OPTIONAL MATCH (domain)-[:have]->(record:Record)',
        'DETACH DELETE domain, record',
    ].join('\n');

    var params = {
        thisServername: servername,
        otherDomainname: other.domainname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
    	//if(err){
    		callback(err);
    	//}

        /*var query2 = [
            'MATCH (server:Server {servername: {thisServername}})',
            'MATCH (domain:Domain {domainname: {otherDomainname}})',
            'MATCH (server)-[:map]->(domain)',
            'OTIONAL MATCH (domain)-[:have]->(record:Record)',
            'DETACH DELETE domain, record',
        ].join('\n');

        var params2 = {
        	thisServername: servername,
            otherDomainname: other.domainname,
        };

        db.cypher({
            query: query2,
            params: params2,
        }, function (err) {
        	callback(err);
        });*/
    });
};

Server.get = function (servername, callback) {
    var query = [
        'MATCH (server:Server {servername: {servername}})',
        'RETURN server',
    ].join('\n');

    var params = {
        servername: servername,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            err = new Error('No such server with servername: ' + servername);
            return callback(err);
        }
        var server = new Server(results[0]['server']);
        callback(null, server);
    });
};



Server.getMap = function (servername, callback) {

    // Query all servers and whether we follow each one or not:
    var query = [
        'MATCH (server:Server {servername: {thisServername}})-[:map]->(domain:Domain)',
        'RETURN domain', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisServername: servername,
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
        	//var servers = new Server(results[i]['thing']);
        	//ownerships.push(servers.servername);
        }
        //if (owns.length == 0)
        //	callback(null,null);
        callback(null, domains);
    });
};



Server.getDelegatedDomainByCompany= function (companyname, servername, callback) {

    // Query all companys and whether we follow each one or not:
    var query = [
        'MATCH (:Company {companyname: {thisCompanyname}})<-[:delegate]-(domain:Domain)<-[:map]-(:Server{servername: {thisServername}})',
        'RETURN domain', // COUNT(rel) is a hack for 1 or 0
    ].join('\n');

    var params = {
        thisCompanyname: companyname,
        thisServername: servername,
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
        	if(!domain.domainname){
        		return callback("Domain exists, but its domainname does not exist");
        	}
        	domains.push(domain.domainname);
        }
        callback(null, domains);
    });
};



Server.mapDomains = function (servername, domainnames, callback) {
	Server.get(servername, function(err, server){
		if(err){
			return callback(err);
		}
		if(domainnames.length){
			domainnames.forEach(function (a, idx, array) {
				Domain.create({domainname:a}, function (err, domain){
					if(err) {
						return callback(err);
					}
					server.map(domain, function (err){
						if(err) {
							return callback(err);
						}		
						if(idx === array.length -1) {
							return callback(null);
						}
					});
				});
			});
		} else{
			return callback(null);
		}
	});
};

Server.getDomains = function(servername, serverport, token, dbUsername, dbPassword, callback){	
	var domiannames = [];
	var args="{\"dbUsername\":\""+dbUsername+"\",\"dbPassword\":\""+dbPassword+"\"}";
	rest.postOperation("http://"+servername+":"+serverport, "domains/list", null, token, null, args, function (error, response) {
		if (error) {
			return callback(error);
		}
		var domains = response.domains;
		if(domains.length){
			domains.forEach(function (a, idx, array) {
				domiannames.push(a.name);
				if(idx === array.length -1) {
					return callback(null, domiannames);
				}
			});
		} else{
			return callback(null, domiannames);
		}
	});
	
};


Server.makeDomainAndMap = function (servername, domainname, token, callback) {
	Server.get(servername, function(err, server){
		if(err){
			return callback(err);
		}
		var args="{\"domainname\":\""+domainname+"\",\"soa\":"+true+",\"ns\":"+true+",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		rest.postOperation("http://"+server.servername, "domains/add", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			}
			Domain.create({domainname:domainname}, function (err, domain){
				if(err) {
					return callback(err);
				}
				server.map(domain, function (err){
					
					return callback(err);
				});
			});
		});
	});
};

Server.removeDomainAndMap = function (servername, domainname, token, callback) {
	Server.get(servername, function(err, server){
		if(err){
			return callback(err);
		}

		var args="{\"domainname\":\""+domainname+"\",\"dbUsername\":\""+server.dbUsername+"\",\"dbPassword\":\""+server.dbPassword+"\"}";
		rest.postOperation("http://"+server.servername, "domains/remove", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			}
			Domain.get(domainname, function(err, domain){
				if(err){
					
					return callback(err);
				}
				server.un_map(domain, function(err){
					
					return callback(err);
				});
			});
		});
	});
};


// Creates the server and persists (saves) it to the db, incl. indexing it:
Server.create = function (props, callback) {
    var query = [
        'CREATE (server:Server {props})',
        'RETURN server',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes servername is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the servername is taken or not.
            err = new errors.ValidationError(
                'The servername ‘' + props.servername + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }
        var server = new Server(results[0]['server']);
        callback(null, server);
    });
};

/*
// Static initialization:

// Register our unique servername constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Server',
    property: 'servername',
}, function (err, constraint) {
    if (err) {
    	throw err;     // Failing fast for now, by crash the application.
    }
    if (constraint) {
        console.log('(Registered unique servernames constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
});
*/