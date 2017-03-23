// record.js
// Record model logic.

var neo4j = require('neo4j');
var errors = require('./errors');
var config = require('../../config/conf.json');
var neo4j_url = "http://"+config.NEO_ID+":"+config.NEO_PW+"@"+config.NEO_ADDRESS;

var checkString = require('./util').checkString;

var db = new neo4j.GraphDatabase({
    url: process.env['NEO4J_URL'] || process.env['GRAPHENEDB_URL'] ||
    	neo4j_url,
    auth: process.env['NEO4J_AUTH'],
});

// Private constructor:

var Record = module.exports = function Record(_node) {
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
        pattern: /^[a-zA-Z]|[!"#$%&'()*+,./:;<=>?@\^_`{|}~-]|[0-9]+$/,
        message: '1-200 any characters.'
    },
};

// Public instance properties:
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

        self._node = results[0]['record'];

        callback(null);
    });
};

Record.prototype.del = function (callback) {
    
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
		
		if(recordname.length > (domainname.length + 1)){ //Record name length is longer than domain name length, that is record name includes domain name at the end
			var lastStr = recordname.substr(recordname.length - domainname.length - 1);
			if( lastStr !== '.' + domainname){ //Record name is not ended by domain name
				recordname += '.'+domainname;
			}
		} else if(recordname.length === domainname.length){ //Record name length is the same as domain name length, that is record name is the same as domain name
			if(recordname !== domainname){ //Roecord name is not same with domain name
				recordname += '.'+domainname;
			}
		} else { //Record name length is shorter than domain name length, that is record name does not include domain name
			recordname += '.'+domainname;
		}

		var record = {
			id: records[i].id,
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

Record.createAndMakeRelationships= function(name, type, content, domainname, companyname, callback){
	Record.create({'recordname':name, 'recordtype':type, 'recordcontent':content}, function(err, record){
		if(err) {
			return callback(err);
		}
		var query = [
	        'MATCH (record:Record {recordname: {thisRecordname}})',
	        'MATCH (domain:Domain {domainname: {otherDomainname}})',
	        'MATCH (company:Company {companyname: {otherCompanyname}})',
	        'MERGE (domain) -[rel1:have]-> (record)',
	        'MERGE (company)-[rel2:delegator_of]-> (record)',
		].join('\n');

	    var params = {
	        thisRecordname: record.recordname,
	        otherDomainname: domainname,
	        otherCompanyname: companyname,
	    };
	    
	    db.cypher({
	        query: query,
	        params: params,
	    }, function (err) {
	        callback(err);
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
        callback(null, record); //Note: Edited record should be returned to edit record in back-end too 
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
