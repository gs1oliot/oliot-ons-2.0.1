
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , auth = require('./auth')
  , http = require('http')
  , path = require('path');

var app = express();

/*var config = {
		  adapter: "mysql",
		  db: "powerdns",
		  user: "root",
		  password: "resl18519"
		};

var pdns = require('pdns')(config);*/


var	passport = require('passport');

var config = require('./conf.json');

// all environments
app.set('port', process.env.PORT || 4000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.session({ secret: auth.randomString() }));
app.use(express.methodOverride());
app.use(passport.initialize());
app.use(passport.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

//app.get('/', routes.index);
//app.get('/users', user.list);

//Initialize the auth layer
auth.configure('/login', '/logout', app);

routes.configure(app);

//pdns.domains.list({}, {}, function(err, domains) {console.log(domains)});

//pdns.domains.add({name: "test.com"}, {soa:true, mx:true, ns:true}, function(err, res) {console.log(res);});


//pdns.records.add("test.com", {name: "ns2", type: "A", content:"12.1.0.1"}, {}, function(err, res) {console.log(err);});
//pdns.records.list("test.com", {}, {}, function(err, records) {console.log(records);});
//pdns.records.remove("test.com", {name: "ns2",  type: "A", content:"12.1.0.1"},{}, function(err, res){console.log(res);});

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
