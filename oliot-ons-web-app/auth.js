var	passport = require('passport'),
	LocalStrategy = require('passport-local').Strategy;

var	rest = require("./rest");

var request = require('request');

var config = require('./conf.json');

var ons_api_address = config.ONS_API_ADDRESS;

exports.configure = function (login_url, logout_url, app) {
	passport.serializeUser(function(user, callback) {
		callback(null, user);
	});

	passport.deserializeUser(function(user, callback) {
		callback(null, user);
	});

	passport.use(new LocalStrategy(
		function(username, password, callback) {
			rest.authenticate(username, password, function(error, token) {
				if (error) {
					return callback(error);
				}

				if (token === null) {
					return callback(null, false);
				} else {
					return callback(null, { email: username, token: token });
				}
			});
		}));

	app.get(login_url + "/:targetURL", function (req, res, next) {
		res.render('login.jade', { user: req.user });
	});

	app.post(login_url + "/:targetURL", function (req, res, next) {
		if(req.body.signup === "Sign Up"){
			res.redirect('/signup');
		} else {
			var target = req.param("targetURL", "/");
			passport.authenticate('local', {
				failureRedirect: login_url + "/" + encodeURIComponent(target),
				successRedirect: target
			}
			)(req, res, next);
		}
	});

	app.get(logout_url, function (req, res) {
		req.logout();
		res.redirect('/');
	});

	/*app.get(login_url + "/:targetURL" + "signup", function (req, res, next) {
		res.render('signup.jade', { user: req.user });
	});*/

	app.get('/signup', function (req, res, next) {
		res.render('signup.jade', { user: req.user });
	});
	
	app.post('/signup', function (req, res, next) {
		var args = 'username='+req.body.username+'&password='+req.body.password+'&usertype='+req.body.select;
		rest.postOperation(ons_api_address, "signup", null, null, null, args ,function(error, response){
			if(error)
			{
				console.log(error);
				res.redirect('/signup');
			}
			else
			{
				console.log(response);
				res.redirect('/');
			}
		});
	});

	
	exports.ensureAuthenticated = function ensureAuthenticated(req, res, next) {
		if (req.isAuthenticated()) { return next(); }
		if(req.url === "/signup"){
			res.redirect(req.url);
		}
		else{
			res.redirect(login_url + "/" + encodeURIComponent(req.url));
		}
	};

	return passport;
};


exports.randomString = function () {
	var randomstring = '';
	for (var idx = 0; idx < 20; idx++) {
	        randomstring += String.fromCharCode(Math.floor(Math.random() * 256));
	}

    	return randomstring;
};
