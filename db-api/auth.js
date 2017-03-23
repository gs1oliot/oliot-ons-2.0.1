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
var pg = require('pg'),
	md5 =  require('md5'),
	model = module.exports,
	//cachedb = require('../cachedb.js'), //This is not used now
	config = require('./config/conf.json');

//Database connection details;

var pg_config = {
    host: config.PG_ADDRESS, // 'localhost' is the default;
    port: config.PG_PORT, // 5432 is the default;
    database: config.PG_DB,
    user: config.PG_ID,
    password: config.PG_PW,
    max: 20,
    idleTimeoutMillis: 30000,
};

var pool = new pg.Pool(pg_config); // database instance;


model.getAccessToken = function (bearerToken, callback) {
	
  pool.connect(function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT access_token, client_id, expires, user_id FROM oauth_access_tokens ' +
        'WHERE access_token = $1', [bearerToken], function (err, result) {
  	  done();
      if (err || !result.rowCount) {
    	  return callback(err);
      }
      var token = result.rows[0];
      callback(null, {
        accessToken: token.access_token,
        clientId: token.client_id,
        expires: token.expires,
        userId: token.userId
      });
    });
  });
};

model.getClient = function (clientId, clientSecret, callback) {
  pool.connect( function (err, client, done) {
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
      callback(null, {
        clientId: client.client_id,
        clientSecret: client.client_secret
      });
    });
  });
};

model.getRefreshToken = function (bearerToken, callback) {
	
  pool.connect( function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT refresh_token, client_id, expires, user_id FROM oauth_refresh_tokens ' +
        'WHERE refresh_token = $1', [bearerToken], function (err, result) {
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });
};

model.grantTypeAllowed = function (clientId, grantType, callback) {
  callback(false, true);
};

model.saveAccessToken = function (accessToken, clientId, expires, userId, callback) {

  pool.connect( function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_access_tokens(access_token, client_id, user_id, expires) VALUES ($1, $2, $3, $4)', [accessToken, clientId, userId.id, expires],
        function (err, result) {
      done();
      callback(err);
    });
  });
};

model.saveRefreshToken = function (refreshToken, clientId, expires, userId, callback) {
	
  pool.connect(function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_refresh_tokens(refresh_token, client_id, user_id, expires) VALUES ($1, $2, $3, $4)', [refreshToken, clientId, userId.id, expires], function (err, result) {
        done();
        callback(err);
    });
  });
};


model.getUser = function (username, password, callback) {
	
  pool.connect( function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT id FROM users WHERE username = $1 AND password = $2', [username,
        md5(password)], function (err, result) {
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });
};


model.getUserbyUsername = function (username, callback) {
	
  pool.connect(function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('SELECT id FROM users WHERE username = $1', [username], function (err, result) {
      done();
      callback(err, result.rowCount ? result.rows[0] : false);
    });
  });
};


model.saveUser = function (username, password, callback) {

	
  pool.connect(function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO users(id, username, password) ' +
			'VALUES (gen_random_uuid(), $1, $2)', [username, md5(password)],
        function (err, result) {
      done();
      callback(err);
    });
  });
};


model.saveOauthClient = function (clientId, clientSecret, redirectUrl, callback) {
  pool.connect(function (err, client, done) {
    if (err) {
    	return callback(err);
    }
    client.query('INSERT INTO oauth_clients(client_id, client_secret, redirect_uri) ' +
			'VALUES ($1, $2, $3)', [clientId, md5(clientSecret), redirectUrl],
        function (err, result) {
      done();
      callback(err);
    });
  });
};

model.deleteExpiredAccessTokens = function (callback){
	pool.connect( function (err, client, done) {
		if (err) {
			return callback(err);
		} 
		client.query('DELETE FROM oauth_access_tokens WHERE expires < (select localtimestamp)', function (err, result) {
		    done();
		    callback(err);
		});
	});
};

model.deleteExpiredRefreshTokens = function (callback){
	pool.connect(function (err, client, done) {
		if (err) {
			return callback(err);
		} 
		client.query('DELETE FROM oauth_refresh_tokens WHERE expires < (select localtimestamp)', function (err, result) {
		   done();
		   callback(err);
		});
	});
};

model.getUseridbyToken = function (token, callback){
	pool.connect(function (err, client, done) {
		if (err) {
			return callback(err);
		}
		client.query('SELECT user_id FROM oauth_access_tokens WHERE access_token = $1', [token], function (err, result){
			done();
		    callback(err, result.rowCount ? result.rows[0] : false);
		});
	});
};


model.getUsernamebyUserid = function (userid, callback){
	pool.connect( function (err, client, done) {
		if (err) {
			return callback(err);
		}
		client.query('SELECT username FROM users WHERE id = $1', [userid], function (err, result){
			done();
		    callback(err, result.rowCount ? result.rows[0] : false);
		});
	});
};

model.getUserbyToken = function (token, callback){
	//This is not used now
	/*cachedb.loadCachedData(token, function(err, results){
		if(results && JSON.parse(results).username){
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
				//This is not used now
				//cachedb.cacheDataWithExpire(token, JSON.stringify(results), config.REDIS_DEFAULT_EXPIRE);
			});
		});	
	//});
};


model.getClientidAndToken = function (callback){
	pool.connect(function (err, client, done) {
		if (err) {
			return callback(err);
		}
		client.query('SELECT client_id,access_token FROM oauth_access_tokens', function (err, result){
			done();
			if(err){
				console.log(err);
				return callback(err);
			}
		    callback(err, result.rowCount ? result.rows : false);
		});
	});
};
