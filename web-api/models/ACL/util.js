function pad(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

var checkString = module.exports.checkString = function(obj) {
  return (obj && typeof obj === 'string' && obj.length > 0);
};



var checkDomainName = module.exports.checkDomainName = function(obj) {
  if(!checkString(obj)) {
	return false;
  }
  var words = obj.split('.');
  if(words.length < 2) {
	  return false;
  }
  var wordsOk = true;
  words.forEach(function(w) {
    wordsOk &= checkString(w);
  });
  return wordsOk;
};


var trim = module.exports.trim = function(str) {
	var	str = str.replace(/^\s\s*/, ''),
		ws = /\s/,
		i = str.length;
	while (ws.test(str.charAt(--i)));
	return str.slice(0, i + 1);
};



