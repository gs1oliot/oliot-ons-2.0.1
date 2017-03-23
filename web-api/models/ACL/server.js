// server.js
// Server model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var Domain = require('./domain');
var config = require('../../config/conf.json');
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;
var rest = require('../../rest');



var db = new neo4j.GraphDatabase({
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Server = module.exports = function Server(_node) {
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
    },
    'dbName': {
        required: true,
        minLength: 2,
        maxLength: 50,
        pattern: /^[A-Za-z0-9_]+$/,
        message: '2-50 characters; letters, numbers, and underscores only.'
    }
};

// Public instance properties:
Object.defineProperty(Server.prototype, 'servername', {
    get: function () { return this._node.properties['servername']; }
});

Object.defineProperty(Server.prototype, 'dbUsername', {
    get: function () { return this._node.properties['dbUsername']; }
});

Object.defineProperty(Server.prototype, 'dbPassword', {
    get: function () { return this._node.properties['dbPassword']; }
});

Object.defineProperty(Server.prototype, 'dbName', {
    get: function () { return this._node.properties['dbName']; }
});

// Private helpers:
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

        self._node = results[0]['server'];

        callback(null);
    });
};

Server.prototype.del = function (callback) {
    
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
    	callback(err);
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
    var query = [
        'MATCH (server:Server {servername: {thisServername}})-[:map]->(domain:Domain)',
        'RETURN domain', 
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
        	var domain = new Domain(results[i]['domain']);
        	if(!domain.domainname) {
        		return callback("Domain exists, but its domainname does not exist"); //This should not occur
        	}
        	domains.push(domain.domainname);
        }
        callback(null, domains);
    });
};



Server.getDelegatedDomainByCompany= function (companyname, servername, callback) {
    var query = [
        'MATCH (:Company {companyname: {thisCompanyname}})<-[:delegate]-(domain:Domain)<-[:map]-(:Server{servername: {thisServername}})',
        'RETURN domain',
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
        		return callback("Domain exists, but its domainname does not exist"); //This should not occur
        	}
        	domains.push(domain.domainname);
        }
        callback(null, domains);
    });
};



Server.mapDomains = function (servername, domainnames, callback) {
	//Map multiple domains at once
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

Server.getDomains = function(servername, serverport, token, dbUsername, dbPassword, dbName, callback){	
	var domiannames = [];
	var args="{\"dbUsername\":\""+dbUsername+"\",\"dbPassword\":\""+dbPassword+"\",\"dbName\":\""+dbName+"\"}";
	//Get domains from back-end. Here, server port is required.
	rest.getOperation("http://"+servername+":"+serverport, "domain", null, token, null, args, function (error, response) {
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
		//Add new domain to back-end
		rest.postOperation("http://"+server.servername, "domain", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			}
			Domain.create({domainname:domainname}, function (err, domain){
				if(err) {
					return callback(err);
				}
				//Add new domain and relationship to access control
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
		//Delete domain from back-end
		rest.delOperation("http://"+server.servername, "domain", null, token, null, args, function (error, response) {
			if (error) {
		       	return callback(error);
			}
			Domain.get(domainname, function(err, domain){
				if(err){
					
					return callback(err);
				}
				//Delete domain and relationship from access control
				server.un_map(domain, function(err){
					
					return callback(err);
				});
			});
		});

	});
};


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
