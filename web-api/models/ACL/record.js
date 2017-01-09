// record.js
// Record model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var config = require('../../config/conf.json');
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;

var checkString = require('pdns/lib/util').checkString;
//var checkDomainName = require('pdns/lib/util').checkDomainName;

var db = new neo4j.GraphDatabase({
    // Support specifying database info via environment variables,
    // but assume Neo4j installation defaults.
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Record = module.exports = function Record(_node) {
    // All we'll really store is the node; the rest of our properties will be
    // derivable or just pass-through properties (see below).
    this._node = _node;
};

// Public constants:

Record.VALIDATION_INFO = {
    'recordname': {
        required: true,
        minLength: 2,
        maxLength: 100,
        pattern: /^[A-Za-z0-9.:]+$/,
        message: '2-100 characters; letters, numbers, \'.\', and, \':\' only.'
    },
    'recordtype': {
        required: true,
        minLength: 1,
        maxLength: 25,
        pattern: /^[A-Z]+$/,
        message: '2-25 characters; upper letters only.'
    },
    'recordcontent': {
        required: true,
        minLength: 1,
        maxLength: 200,
        pattern: /^(?=.*[a-zA-Z])(?=.*[!"#$%&'()*+,./:;<=>?@\^_`{|}~-])(?=.*[0-9]).{1,200}$/,
        message: '1-200 any characters.'
    },
};

// Public instance properties:

// The record's recordname, e.g. 'aseemk'.
Object.defineProperty(Record.prototype, 'recordname', {
    get: function () { return this._node.properties['recordname']; }
});

Object.defineProperty(Record.prototype, 'recordtype', {
    get: function () { return this._node.properties['recordtype']; }
});

Object.defineProperty(Record.prototype, 'recordcontent', {
    get: function () { return this._node.properties['recordcontent']; }
});
// Private helpers:

//Validates the given property based on the validation info above.
//By default, ignores null/undefined/empty values, but you can pass `true` for
//the `required` param to enforce that any required properties are present.
function validateProp(prop, val, required) {
 var info = Record.VALIDATION_INFO[prop];
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
// (This allows `Record.prototype.patch` to not require any.)
// You can pass `true` for `required` to validate that all required properties
// are present too. (Useful for `Record.create`.)
function validate(props, required) {
    var safeProps = {};

    for (var prop in Record.VALIDATION_INFO) {
    	if(Record.VALIDATION_INFO.hasOwnProperty(prop)){
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

// Atomically updates this record, both locally and remotely in the db, with the
// given property updates.
Record.prototype.patch = function (props, callback) {
    var safeProps = validate(props);

    var query = [
        'MATCH (record:Record {recordname: {recordname}})',
        'SET record += {props}',
        'RETURN record',
    ].join('\n');

    var params = {
        recordname: this.recordname,
        props: safeProps,
    };

    var self = this;

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes recordname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the recordname is taken or not.
            err = new errors.ValidationError(
                'The recordname ‘' + props.recordname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }

        if (!results.length) {
            err = new Error('Record has been deleted! Recordname: ' + self.recordname);
            return callback(err);
        }

        // Update our node with this updated+latest data from the server:
        self._node = results[0]['record'];

        callback(null);
    });
};

Record.prototype.del = function (callback) {
    // Use a Cypher query to delete both this record and his/her following
    // relationships in one query and one network request:
    // (Note that this'll still fail if there are any relationships attached
    // of any other types, which is good because we don't expect any.)
    
	var query = [
	   'MATCH (record:Record {recordname: {thisRecordname}})',
	   'DETACH DELETE record'
	   
	].join('\n');

    var params = {
        thisRecordname: this.recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err) {
        callback(err);
    });
};

Record.refineRecords = function (domainname, records) {
	var refinedRecords=[];
	for(var i = 0 ; i<records.length; ++i){

		var recordname = records[i].name;
		
		if(recordname.length > (domainname.length + 1)){
			var lastStr = recordname.substr(recordname.length - domainname.length - 1);
			if( lastStr !== '.' + domainname){
				recordname += '.'+domainname;
			}
		} else if(recordname.length === domainname.length){
			if(recordname !== domainname){
				recordname += '.'+domainname;
			}
		} else {
			recordname += '.'+domainname;
		}

		var record = { 
				name: recordname, 
				type: records[i].type,
				content: records[i].content,
				ttl: records[i].ttl,
			};
		refinedRecords.push(record);
	}
	return refinedRecords;
}
Record.checkRecords = function (records) {
	var wordsOk = true;
	for(var i = 0 ; i<records.length; ++i){
	    if(!checkString(records[i].name) || !checkString(records[i].type) || !checkString(records[i].content)) {
	    	wordsOk = false;
	    	return wordsOk;
	    }
	}
	return wordsOk;
};

Record.createAndMakeRelationships= function(name, type, content, domain, company, callback){
	Record.create({'recordname':name, 'recordtype':type, 'recordcontent':content}, function(err, record){
		if(err) {
			return callback(err);
		}
		domain.have(record, function(err){
			if(err) {
				return callback(err);
			}
			company.delegator_of(record, function(err){
				if(err) {
					return callback(err);
				}
				callback(null);
			});
		});
	});
};


Record.edit= function(name, editname, edittype, editcontent,  callback){

	var query = [
	   'MATCH (record:Record {recordname: {thisRecordname}})',
	   'SET record.recordname = {editRecordname}',
	   'SET record.recordtype = {editRecordtype}',
	   'SET record.recordcontent = {editRecordcontent}',
	   'RETURN record'
	   
	].join('\n');

    var params = {
        thisRecordname: name,
        editRecordname: editname,
        editRecordtype: edittype,
        editRecordcontent: editcontent,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            return callback(null, null);
        }
        var record = new Record(results[0]['record']);
        callback(null, record);
    });
};


Record.get = function (recordname, callback) {
    var query = [
        'MATCH (record:Record {recordname: {recordname}})',
        'RETURN record',
    ].join('\n');

    var params = {
        recordname: recordname,
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (err) {
        	return callback(err);
        }
        if (!results.length) {
            return callback(null, null);
        }
        var record = new Record(results[0]['record']);
        callback(null, record);
    });
};




// Creates the record and persists (saves) it to the db, incl. indexing it:
Record.create = function (props, callback) {
    var query = [
        'CREATE (record:Record {props})',
        'RETURN record',
    ].join('\n');

    var params = {
        props: validate(props)
    };

    db.cypher({
        query: query,
        params: params,
    }, function (err, results) {
        if (isConstraintViolation(err)) {
            // TODO: This assumes recordname is the only relevant constraint.
            // We could parse the constraint property out of the error message,
            // but it'd be nicer if Neo4j returned this data semantically.
            // Alternately, we could tweak our query to explicitly check first
            // whether the recordname is taken or not.
            err = new errors.ValidationError(
                'The recordname ‘' + props.recordname + '’ is taken.');
        }
        if (err) {
        	return callback(err);
        }
        var record = new Record(results[0]['record']);
        callback(null, record);
    });
};

/*
// Static initialization:

// Register our unique recordname constraint.
// TODO: This is done async'ly (fire and forget) here for simplicity,
// but this would be better as a formal schema migration script or similar.
db.createConstraint({
    label: 'Record',
    property: 'recordname',
}, function (err, constraint) {
    if (err) {
    	throw err;     // Failing fast for now, by crash the application.
    }
    if (constraint) {
        console.log('(Registered unique recordnames constraint.)');
    } else {
        // Constraint already present; no need to log anything.
    }
});
*/