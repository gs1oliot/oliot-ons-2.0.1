var cluster = require('cluster');

if(cluster.isMaster) {
    var numWorkers = require('os').cpus().length;
	
	console.log('Master cluster setting up ' + numWorkers + ' workers...');
	
	for(var i = 0; i < numWorkers; i++) {
	    cluster.fork();
	}
	
	cluster.on('online', function(worker) {
	    console.log('Worker ' + worker.process.pid + ' is online');
	});
	
	cluster.on('exit', function(worker, code, signal) {
	    console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
	    console.log('Starting a new worker');
	    cluster.fork();
	});
} else {
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , auth = require("./models/ACL/auth")
  , http = require('http')
  , path = require('path');

var app = express();

// all environments
app.set('port', process.env.PORT || 4001);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' === app.get('env')) {
  app.use(express.errorHandler());
}

routes.configure(app);
setInterval(function(){
	auth.deleteExpiredAccessTokens(function(err){
		if(err) {
			console.log("deleteExpiredAccessToken function error:"+err);
		}
		auth.deleteExpiredRefreshTokens(function(err){
			if(err) {
				console.log("deleteExpiredAccessToken function error:"+err);
			}
		});
	});
}, 600000);


http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
}
