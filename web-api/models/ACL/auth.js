/**
 * Copyright 2013-present NightWorld.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var //pg = require('pg'),
	md5 =  require('md5'),
	model = module.exports,
	config = require('../../config/conf.json'),
	//connString = "postgres://"+config.PG_ID+":"+config.PG_PW+ "@" + config.PG_ADDRDB,
	promise = require('bluebird'); // or any other Promise/A+ compatible library;

var options = {
    promiseLib: promise // overriding the default (ES6 Promise);
};
var pgp = require('pg-promise')(options);
//Database connection details;

var cn = {
    host: config.PG_ADDRESS, // 'localhost' is the default;
    port: config.PG_PORT, // 5432 is the default;
    database: config.PG_DB,
    user: config.PG_ID,
    password: config.PG_PW
};
// You can check for all default values in:
// https://github.com/brianc/node-postgres/blob/master/lib/defaults.js

var db = pgp(cn); // database instance;


/*
 * Required
 */

model.getAccessToken = function (bearerToken, callback) {

	var sco;
	
	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('SELECT access_token, client_id, expires, user_id FROM oauth_access_tokens ' +
			        'WHERE access_token = $1', [bearerToken]);
		})
		.then(function (data){
			//console.log(data);
			if(data.length){
				var token = data[0];
				callback(null, {
					accessToken: token.access_token,
					clientId: token.client_id,
					expires: token.expires,
					userId: token.userId
		    	});
			} else {
				callback("There is no Access token for getAccessToken()");
			}
		})
	    .catch(function (error) {
	        console.log(error); // display the error; 
	    	return callback(error);
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	

	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT access_token, client_id, expires, user_id FROM oauth_access_tokens ' +
        'WHERE access_token = $1', [bearerToken], function (err, result) {
  	  done();
      if (err || !result.rowCount) {
    	  return callback(err);
      }
      // This object will be exposed in req.oauth.token
      // The user_id field will be exposed in req.user (req.user = { id: "..." }) however if
      // an explicit user object is included (token.user, must include id) it will be exposed
      // in req.user instead
      var token = result.rows[0];
      callback(null, {
        accessToken: token.access_token,
        clientId: token.client_id,
        expires: token.expires,
        userId: token.userId
      });
    });
  });*/
};

model.getClient = function (clientId, clientSecret, callback) {

	var sco;
	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('SELECT client_id, client_secret, redirect_uri FROM oauth_clients WHERE ' +
				      'client_id = $1', [clientId]);
		})
		.then(function (data){
			if(data.length){
		      var client = data[0];

		      if (clientSecret !== null && client.client_secret !== md5(clientSecret)) {
		    	  return callback();
		      }

		      // This object will be exposed in req.oauth.client
		      callback(null, {
		        clientId: client.client_id,
		        clientSecret: client.client_secret
		      });
		      
			} else {
				callback("There is no client for getClient()");
			}
		})
	    .catch(function (error) {
	        console.log(error); // display the error; 
	    	return callback(error);
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }

    client.query('SELECT client_id, client_secret, redirect_uri FROM oauth_clients WHERE ' +
      'client_id = $1', [clientId], function (err, result) {
  	  done();
      if (err || !result.rowCount) {
    	  return callback(err);
      }

      var client = result.rows[0];

      if (clientSecret !== null && client.client_secret !== md5(clientSecret)) {
    	  return callback();
      }

      // This object will be exposed in req.oauth.client
      callback(null, {
        clientId: client.client_id,
        clientSecret: client.client_secret
      });
    });
  });*/
};

model.getRefreshToken = function (bearerToken, callback) {

	var sco;

	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('SELECT refresh_token, client_id, expires, user_id FROM oauth_refresh_tokens ' +
			        'WHERE refresh_token = $1', [bearerToken]);
		})
		.then(function (data){
			callback(null, data.length? data[0]:false);
		})
	    .catch(function (error) {
	        console.log(error); // display the error; 
	    	return callback(error);
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT refresh_token, client_id, expires, user_id FROM oauth_refresh_tokens ' +
        'WHERE refresh_token = $1', [bearerToken], function (err, result) {
      // The returned user_id will be exposed in req.user.id
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });*/
};

// This will very much depend on your setup, I wouldn't advise doing anything exactly like this but
// it gives an example of how to use the method to resrict certain grant types
var authorizedClientIds = ['abc1', 'def2'];
model.grantTypeAllowed = function (clientId, grantType, callback) {
  callback(false, true);
};

model.saveAccessToken = function (accessToken, clientId, expires, userId, callback) {

	var sco;

	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('INSERT INTO oauth_access_tokens(access_token, client_id, user_id, expires)'+
					'VALUES ($1, $2, $3, $4)', [accessToken, clientId, userId.id, expires]);
		})
		.then(function (data){
			return callback(null);
		})
	    .catch(function (error) {
	        console.log(error); // display the error; 
	    	return callback(error);
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	
  //console.log(expires);
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_access_tokens(access_token, client_id, user_id, expires) VALUES ($1, $2, $3, $4)', [accessToken, clientId, userId.id, expires],
        function (err, result) {
      done();
      callback(err);
    });
  });*/
};

model.saveRefreshToken = function (refreshToken, clientId, expires, userId, callback) {

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('INSERT INTO oauth_refresh_tokens(refresh_token, client_id, user_id, expires)' +
				'VALUES ($1, $2, $3, $4)', [refreshToken, clientId, userId.id, expires]);
	})
	.then(function (data){
		return callback(null);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_refresh_tokens(refresh_token, client_id, user_id, expires) VALUES ($1, $2, $3, $4)', [refreshToken, clientId, userId.id, expires], function (err, result) {
        done();
        callback(err);
    });
  });*/
};

/*
 * Required to support password grant type
 */
model.getUser = function (username, password, callback) {

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('SELECT id FROM users WHERE username = $1 AND password = $2', 
				[username, md5(password)]);
	})
	.then(function (data){
	      callback(null, data.length? data[0]:false);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT id FROM users WHERE username = $1 AND password = $2', [username,
        md5(password)], function (err, result) {
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });*/
};


model.getUserbyUsername = function (username, callback) {

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('SELECT id FROM users WHERE username = $1', [username]);
	})
	.then(function (data){
		callback(null, data.length ? data[0] : false);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT id FROM users WHERE username = $1', [username], function (err, result) {
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });*/
};


model.saveUser = function (username, password, callback) {

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('INSERT INTO users(id, username, password) ' +
				'VALUES (gen_random_uuid(), $1, $2)', [username, md5(password)]);
	})
	.then(function (data){
		return callback(null);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO users(id, username, password) ' +
			'VALUES (gen_random_uuid(), $1, $2)', [username, md5(password)],
        function (err, result) {
      done();
      callback(err);
    });
  });*/
};


model.saveOauthClient = function (clientId, clientSecret, redirectUrl, callback) {

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('INSERT INTO oauth_clients(client_id, client_secret, redirect_uri) ' +
				'VALUES ($1, $2, $3)', [clientId, md5(clientSecret), redirectUrl]);
	})
	.then(function (data){
		return callback(null);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
  /*pg.connect(connString, function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_clients(client_id, client_secret, redirect_uri) ' +
			'VALUES ($1, $2, $3)', [clientId, md5(clientSecret), redirectUrl],
        function (err, result) {
      done();
      callback(err);
    });
  });*/
};

model.deleteExpiredAccessTokens = function (callback){

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('DELETE FROM oauth_access_tokens WHERE expires < (select localtimestamp)');
	})
	.then(function (data){
		return callback(null);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
	/*pg.connect(connString, function (err, client, done) {
		if (err) {
			return callback(err);
		} 
		client.query('DELETE FROM oauth_access_tokens WHERE expires < (select localtimestamp)', function (err, result) {
		    done();
		    callback(err);
		});
	});*/
};

model.deleteExpiredRefreshTokens = function (callback){

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('DELETE FROM oauth_refresh_tokens WHERE expires < (select localtimestamp)');
	})
	.then(function (data){
		return callback(null);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
	/*pg.connect(connString, function (err, client, done) {
		if (err) {
			return callback(err);
		} 
		client.query('DELETE FROM oauth_refresh_tokens WHERE expires < (select localtimestamp)', function (err, result) {
		   done();
		   callback(err);
		});
	});*/
};

model.getUseridbyToken = function (token, callback){

	var sco;
	
	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('SELECT user_id FROM oauth_access_tokens WHERE access_token = $1', [token]);
		})
		.then(function (data){
			callback(null, data.length ? data[0] : false);
			
		})
	    .catch(function (error) {
	        console.log(error); // display the error;
			return callback(error); 
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	
	/*pg.connect(connString, function (err, client, done) {
		if (err) {
			return callback(err);
		}
		client.query('SELECT user_id FROM oauth_access_tokens WHERE access_token = $1', [token], function (err, result){
			done();
		    callback(err, result.rowCount ? result.rows[0] : false);
		});
	});*/
};


model.getUsernamebyUserid = function (userid, callback){

	var sco;
	db.connect()
	.then(function (obj){
		sco = obj;
		return sco.query('SELECT username FROM users WHERE id = $1', [userid]);
	})
	.then(function (data){
		callback(null, data.length ? data[0] : false);
	})
    .catch(function (error) {
        console.log(error); // display the error; 
    	return callback(error);
    })
    .finally(function () {
        if (sco) {
            sco.done(); // release the connection, if it was successful; 
        }
    });
	
	/*pg.connect(connString, function (err, client, done) {
		if (err) {
			return callback(err);
		}
		client.query('SELECT username FROM users WHERE id = $1', [userid], function (err, result){
			done();
		    callback(err, result.rowCount ? result.rows[0] : false);
		});
	});*/
};

model.getUserbyToken = function (token, callback){
	/*cachedb.loadCachedData(token, function(err, results){
		if(results && JSON.parse(results).username){
			//console.log("cache hit for :"+token);
			cachedb.setExpire(token, config.REDIS_DEFAULT_EXPIRE);
			return callback(err, JSON.parse(results));
		}*/ 
		model.getUseridbyToken(token, function(err, results){
			if(err){
				return callback(err);
			}
			if(!results){
				return callback("there is no matched user");
			}
			model.getUsernamebyUserid(results.user_id, function(err, results){
				if(err){
					return callback(err);
				}
				if(!results){
					return callback("there is no matched user");
				}
				callback(err, results);
				//console.log(config.REDIS_DEFAULT_EXPIRE);
				//cachedb.cacheDataWithExpire(token, JSON.stringify(results), config.REDIS_DEFAULT_EXPIRE);
			});
		});	
	//});
};


model.getClientidAndToken = function (callback){
	var sco;
	
	db.connect()
		.then(function (obj){
			sco = obj;
			return sco.query('SELECT client_id,access_token FROM oauth_access_tokens');
		})
		.then(function (data){
			callback(null, data);
			
		})
	    .catch(function (error) {
	        console.log(error); // display the error;
			return callback(error); 
	    })
	    .finally(function () {
	        if (sco) {
	            sco.done(); // release the connection, if it was successful; 
	        }
	    });
	
};
