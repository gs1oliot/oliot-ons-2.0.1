
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , backup = require('./backup')
  , config = require('./config/conf.json')
  , path = require('path');

var app = express();

// all environments
app.set('port', process.env.PORT || 4002);
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
	backup.backup_records(function(err){
		if(err){
			console.log(err);
		}
	});
	
}, config.BACKUP_EXPIRATION);



http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
