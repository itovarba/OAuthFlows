const { debug } = require('console');
const config = require('./config.js');

var express = require('express'),
	http = require('http'),
	request = require('request'),
	bodyParser = require('body-parser'),
	morgan = require('morgan'),
	app = express(),
	path = require("path"),
	https = require('https'),
	fs = require('fs'),
	base64url = require('base64-url'),
	nJwt = require('njwt'),
	apiVersion = 'v51.0',
	// domainName= process.env.DOMAIN_NAME || 'localhost:8081',
	jwt_consumer_key = '3MVG9SOw8KERNN0.3wkuxfmJzqFlYMaQ5lde3DhQrcgTnG3Y5WAc2e_d3L9hlWUS20aKLyF.1DFz.HoZbWaP9',
	consumer_secret = '1DF1E5721AF6F7E45CABAA99CE0376DB9402B1EDB423056145278EBB5B715B9E',
	jwt_aud = 'https://iberiaidentitylabs.force.com/identity',
	jwt_consumer_keyHA = '3MVG9SOw8KERNN0.3wkuxfmJzqJ.9t_bvFmlzFnZqhu.LepsCwe.iYhn4wNDd7U9FO6fwYVrjBvrmrs0FsLmb',
	consumer_secretHA = 'EF9EB279DA4F5958578621B31C27FF135F918B63EB4CAE7657EAC9E9B2BC33E3',
	callbackURL = config.CALLBACK_URL;

qrcode = require('qrcode-npm'),
	decode = require('salesforce-signed-request'),
	canvas_consumer_secret = 'CB61ED01EA3693777FA4E403D6B775FCD94A9971FBCXXX89F25EA75383ACCCD9E69';

app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/client'));

app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set('port', process.env.PORT || 8080);

app.post('', function (req, res) {

});

app.post('/signedrequest', function (req, res) {
	// You could save this information in the user session if needed
	var signedRequest = decode(req.body.signed_request, canvas_consumer_secret),
		context = signedRequest.context,
		oauthToken = signedRequest.client.oauthToken,
		instanceUrl = signedRequest.client.instanceUrl;

	contactRequest = creatContactQuery(oauthToken, context, instanceUrl);

	request(contactRequest, function (err, response, body) {
		var imgTag = getQRCode(JSON.parse(body).records[0]);
		res.render('canvasSignedReq', { context: context, imgTag: imgTag, canvasMode: "Authentication - Signed Request" });
	});

});

function getQRCode(contact) {
	var qr = qrcode.qrcode(4, 'L'),
		text = 'MECARD:N:' + contact.LastName + ',' + contact.FirstName + ';TEL:' + contact.Phone + ';EMAIL:' + contact.Email + ';;';
	qr.addData(text);
	qr.make();
	return qr.createImgTag(4);
}

function creatContactQuery(oauthToken, context, instanceUrl) {
	query = "SELECT Id, FirstName, LastName, Phone, Email FROM Contact WHERE Id = '" + context.environment.record.Id + "'",

		contactRequest = {
			url: instanceUrl + '/services/data/v51.0/query?q=' + query,
			headers: {
				'Authorization': 'OAuth ' + oauthToken
			}
		};
	return contactRequest;
}

/**
 *  Extract Access token from POST response and redirect to page Main
 */
function extractAccessToken(err, remoteResponse, remoteBody, res, isHa) {
	if (err) {
		return res.status(500).end('Error');
	}
	console.log(remoteBody);
	var sfdcResponse = JSON.parse(remoteBody);

	//success
	if (sfdcResponse.access_token) {
		if (!isHa) {
			res.writeHead(302, {
				'Location': 'Main',
				'Set-Cookie': ['AccToken=' + sfdcResponse.access_token,
				'RefToken=' + sfdcResponse.refresh_token,
				'IssuedAt=' + sfdcResponse.issued_at,
				'IdToken=' + sfdcResponse.id_token,
				'APIVer=' + apiVersion,
				'InstURL=' + sfdcResponse.instance_url,
				'idURL=' + sfdcResponse.id]
			});
		} else {
			res.writeHead(302, {
				'Location': 'Main',
				'Set-Cookie': ['AccTokenHA=' + sfdcResponse.access_token,
				'IssuedAtHA=' + sfdcResponse.issued_at,
				'IdTokenHA=' + sfdcResponse.id_token,
				'APIVerHA=' + apiVersion,
				'InstURLHA=' + sfdcResponse.instance_url,
				'idURLHA=' + sfdcResponse.id]
			});
		}
	} else {
		res.write('Some error occurred. Make sure connected app is approved previously if its JWT flow, Username and Password is correct if its Password flow. ');
		res.write(' Salesforce Response : ');
		res.write(remoteBody);
	}
	res.end();
}

app.all('/proxy', function (req, res) {
	var url = req.header('SalesforceProxy-Endpoint');
	request({
		url: url, method: req.method, json: req.body,
		headers: { 'Authorization': req.header('X-Authorization'), 'Content-Type': 'application/json' }, body: req.body
	}).pipe(res);
});

app.get('/jwt', function (req, res) {
	var isSandbox = req.query.isSandbox;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/token';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}
	var sfdcUserName = req.query.jwtUserName;
	var token = getJWTSignedToken_nJWTLib(sfdcUserName);

	var paramBody = 'grant_type=' + base64url.escape('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + token;
	var req_sfdcOpts = {
		url: sfdcURL,
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: paramBody
	};

	request(req_sfdcOpts,
		function (err, remoteResponse, remoteBody) {
			extractAccessToken(err, remoteResponse, remoteBody, res, false);
		}
	);
});

/**
 * Step 1 Web Server Flow - Get Code
 */
app.get('/webServer', function (req, res) {
	var isSandbox = req.query.isSandbox;
	var state = 'webServerProd';
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/authorize';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/authorize';
		state = 'webServerSandbox';
	}

	var url = sfdcURL + '?client_id=' + jwt_consumer_key + '&redirect_uri=' + callbackURL + '&response_type=code&state=' + state;
	console.log(url);

	request({ url: url, method: 'GET' }).pipe(res);

});



/**
 * Step 2 Web Server Flow - Get token from Code
 */
app.get('/webServerStep2', function (req, res) {
	debugger;
	var state = req.query.state;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/token';
	if (state == 'webServerSandbox') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}

	request({
		url: sfdcURL + '?client_id=' +
			jwt_consumer_key + '&redirect_uri=' +
			callbackURL + '&grant_type=authorization_code&code=' +
			req.query.code + '&client_secret' + consumer_secret,
		method: 'POST'
	},
		function (err, remoteResponse, remoteBody) {
			extractAccessToken(err, remoteResponse, remoteBody, res, false);
		}
	);

});

/**
 * Step 1 Web Server Flow (HA) - Get Code
 */
app.get('/webServerHA', function (req, res) {
	var isSandbox = req.query.isSandbox;
	var state = 'webServerProdHA';
	var sfdcURL = 'https://iberiaidentitylabs.force.com/customers/services/oauth2/authorize';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/authorize';
		state = 'webServerSandbox';
	}

	var url = sfdcURL + '?client_id=' + jwt_consumer_keyHA + '&redirect_uri=' + callbackURL + '&response_type=code&state=' + state;
	console.log(url);

	request({ url: url, method: 'GET' }).pipe(res);

});



/**
 * Step 2 Web Server Flow (HA) - Get token from Code
 */
app.get('/webServerStep2HA', function (req, res) {
	debugger;
	var state = req.query.state;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/customers/services/oauth2/token';
	if (state == 'webServerSandbox') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}

	request({
		url: sfdcURL + '?client_id=' +
			jwt_consumer_keyHA + '&redirect_uri=' +
			callbackURL + '&grant_type=authorization_code&code=' +
			req.query.code + '&client_secret=' + consumer_secretHA,
		method: 'POST'
	},
		function (err, remoteResponse, remoteBody) {
			extractAccessToken(err, remoteResponse, remoteBody, res, true);
		}
	);

});


/**
*	 User Agent oAuth Flow
*/
app.get('/uAgent', function (req, res) {
	debugger;
	var isSandbox = req.query.isSandbox;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/authorize';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/authorize';
	}

	request({
		url: sfdcURL + '?client_id=' + jwt_consumer_key + '&redirect_uri=' + callbackURL + '&response_type=token',
		method: 'GET'
	}).pipe(res);

});

/**
*	 Username Password oAuth Flow
*/
app.post('/uPwd', function (req, res) {

	var instance = req.body.instance;
	var uname = req.body.sfdcUsername;
	var pwd = req.body.sfdcPassword;

	var state = req.query.state;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/token';
	if (instance == 'sand') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}

	var computedURL = sfdcURL +
		'?client_id=' + jwt_consumer_key +
		'&grant_type=password' +
		'&client_secret=' + consumer_secret +
		'&username=' + uname +
		'&password=' + pwd;


	request({
		url: computedURL,
		method: 'POST'
	},
		function (err, remoteResponse, remoteBody) {
			extractAccessToken(err, remoteResponse, remoteBody, res, false);
		}
	);
});

/**
 * Device Authentication Flow
 */
app.get('/device', function (req, res) {

	var isSandbox = req.query.isSandbox;
	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/token';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}

	var computedURL = sfdcURL +
		'?client_id=' + jwt_consumer_key +
		'&response_type=device_code';


	request({
		url: computedURL,
		method: 'POST'
	},
		function (err, remoteResponse, remoteBody) {
			if (err) {
				res.write(err);
				res.end();
				//return res.status(500).end('Error'); 
				return;
			}
			console.log(remoteBody);
			var sfdcResponse = JSON.parse(remoteBody);

			if (sfdcResponse.verification_uri) {
				res.render('deviceOAuth', {
					verification_uri: sfdcResponse.verification_uri,
					user_code: sfdcResponse.user_code,
					device_code: sfdcResponse.device_code,
					isSandbox: isSandbox
				});
			}
		}
	);
});

/**
 *  Keep polling till device is verified using code
 */

app.get('/devicePol', function (req, res) {

	var isSandbox = req.query.isSandbox;
	var verification_uri = req.query.verification_uri;
	var user_code = req.query.user_code;
	var device_code = req.query.device_code;

	var sfdcURL = 'https://iberiaidentitylabs.force.com/identity/services/oauth2/token';
	if (isSandbox == 'true') {
		sfdcURL = 'https://test.salesforce.com/services/oauth2/token';
	}

	var computedURL = sfdcURL +
		'?client_id=' + jwt_consumer_key +
		'&grant_type=device' +
		'&code=' + device_code;

	request({
		url: computedURL,
		method: 'POST'
	},
		function (err, remoteResponse, remoteBody) {
			if (err) {
				return res.status(500).end('Error');
			}
			console.log(remoteBody);
			var sfdcResponse = JSON.parse(remoteBody);

			if (sfdcResponse.access_token) {
				res.writeHead(302, {
					'Location': 'Main',
					'Set-Cookie': ['AccToken=' + sfdcResponse.access_token, 'APIVer=' + apiVersion, 'InstURL=' + sfdcResponse.instance_url, 'idURL=' + sfdcResponse.id]
				});
				res.end();
			} else {
				res.render('deviceOAuth', {
					verification_uri: verification_uri,
					user_code: user_code,
					device_code: device_code,
					isSandbox: isSandbox
				});
			}
		}
	);
});



function getJWTSignedToken_nJWTLib(sfdcUserName) {
	var claims = {
		iss: jwt_consumer_key,
		sub: sfdcUserName,
		aud: jwt_aud,
		exp: (Math.floor(Date.now() / 1000) + (60 * 3))
	}

	return encryptUsingPrivateKey_nJWTLib(claims);
}

function encryptUsingPrivateKey_nJWTLib(claims) {
	var absolutePath = path.resolve("key.pem");
	var cert = fs.readFileSync(absolutePath);
	var jwt_token = nJwt.create(claims, cert, 'RS256');
	console.log(jwt_token);
	var jwt_token_b64 = jwt_token.compact();
	console.log(jwt_token_b64);

	return jwt_token_b64;
};


app.get('/', function (req, res) {
	res.sendfile('views/index.html');
});

app.get('/index*', function (req, res) {
	res.sendfile('views/index.html');
});

app.get('/oauthcallback.html', function (req, res) {
	res.sendfile('views/oauthcallback.html');
});

app.get('/Main*', function (req, res) {
	res.sendfile('views/Main.html');
});

app.listen(app.get('port'), function () {
	console.log('Express server listening on port ' + app.get('port'));
});

var options = {
	key: fs.readFileSync('./key.pem', 'utf8'),
	cert: fs.readFileSync('./iberiaidlab.crt', 'utf8')
};

https.createServer(options, app).listen(8081);
console.log("Server listening for HTTPS connections on port ", 8081);