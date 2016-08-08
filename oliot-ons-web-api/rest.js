var request = require('request');

exports.getOperationRequest = function (uri, operation, username, token, password) {
	var uri_base = uri;
	if (uri_base.lastIndexOf('/') !== uri_base.length - 1) {
		uri_base += "/";
	}
	
	var headers_dict;
	var auth;
	
	if(token !== null) {
		auth =  'Bearer '+token;
		headers_dict = {
				'Authorization' : auth,
				'Content-type' : 'application/json'
		};
		
		
	} else if(password !== null) {
		var clientid =username.replace(/\./gi,"").replace(/@/gi,"");
	
		auth = 'Basic ' + new Buffer(clientid + ':' + password).toString('base64');
	
		headers_dict = {
				'Authorization': auth,
				'Content-type': 'application/x-www-form-urlencoded'
		};
	} else {
		headers_dict = {
			'Content-type': 'application/x-www-form-urlencoded'
		};
	}
	
	return {
		uri: uri_base + operation,
		headers: headers_dict
	};
};

exports.postOperation = function (uri, operation, username, token, password, args, callback) {
	if (operation === null) {
		return callback("invalid input to executeOperation");
	}

	var operationReq = exports.getOperationRequest(uri, operation, username, token, password);
	operationReq.body = args;
	console.log(operationReq);
	
	request.post(operationReq, function (error, res, body){
		if (error) {
			return callback(error);
		}
		if (res.statusCode === 200) {
			try {
				var operationResponse = JSON.parse(body);
				if(operationResponse.error){
					return callback(operationResponse.error);
				}
				return callback(null, operationResponse);
			} catch (e) {
				return callback("invalid JSON returned for " + operation);
			}
		} else if (res.statusCode >= 401 && res.statusCode <= 403) {
			return callback(null, null);
		} else {
			return callback("authentication failed, status code from rest api was " + res.statusCode);
		}
	});
	
	
};


exports.getOperation = function (uri, operation, username, token, password, args, callback) {
	if (operation === null) {
		return callback("invalid input to executeOperation");
	}

	var operationReq = exports.getOperationRequest(uri, operation, username, token, password);
	if(args) {
		operationReq.body = args;
	}
	
	console.log(operationReq);
	
	request.get(operationReq, function (error, res, body){
		if (error) {
			return callback(error);
		}
		if (res.statusCode === 200) {
			try {
				console.log(body);
				var operationResponse = JSON.parse(body);
				if(operationResponse.error) {
					return callback(operationResponse.error);
				}
				return callback(null, operationResponse);
			} catch (e) {
				return callback("invalid JSON returned for " + operation);
			}
		} else if (res.statusCode >= 401 && res.statusCode <= 403) {
			return callback(null, null);
		} else {
			return callback("authentication failed, status code from rest api was " + res.statusCode);
		}
	});
	
	
};

