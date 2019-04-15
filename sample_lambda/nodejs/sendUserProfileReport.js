/**
 * Copyright <YEAR> Amazon.com, Inc. and its affiliates. All Rights Reserved.

 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at

 * http://aws.amazon.com/asl/

 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
**/

var querystring = require('querystring');
var https = require('https');

var mRefreshToken;
var mAuthTokens;
var mAccessToken;

/**
 * when a user in the Alexa App, enables your skill, your reciprocalAccessTokenUrl endpoint will be invoked
 * the endpoint should have code similar to this sample code to accept the Authorization code and use it to 
 * retrieve access & refresh token from LWA. You need to make sure you can always associate the tokens with the customer, which is
 * identified by the Authorization_header of the request sent.
 * Use the value of access_token retrieved as Authorization header of the POST request
 * to api.amazonalexa.com/v1/health/profile. Send the profile report in the POST request.  
**/
exports.handler = function(event, context, callback) {
    log('Received event:', JSON.stringify(event, null, 2));
    log('Alexa Authorization Code received is ' + event.body.split("&")[1].split("=")[1]);
    (getAccessAndRefreshTokens(event.body.split("&")[1].split("=")[1])).then((authTokens) => sendProfileReport(authTokens));
    // TODO : add logic here to respond with appropriate status code (ex. in case of failure to retireve access token or send user profile report)
    callback(null, { "statusCode" : 200, "body" : "Token accepted" });
};

/**
 * Given the Alexa Authorization Code, get the refresh and access token from LWA
 */
getAccessAndRefreshTokens = module.exports.getAccessAndRefreshTokens = function(authorizationCode) {
  return new Promise((resolve, reject) => {
    var jsonString, jsonObject, options = {
      'host': 'api.amazon.com',
      path: '/auth/o2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      }
      
    };
    
    var post_data = querystring.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      // clientId and client secret retrieved from Permissions Section on Developer Portal on enabling Send Alexa Profiles toggle
      client_id: '<replace_with_your_clientId>',
      client_secret: '<replace_with_your_clientSecret>'
    });
    
    log('getAccessAndRefreshTokens', 'requestOptions: ' + stringify(options) + 'post_data ' + stringify(post_data));
    var req = https.request(options, function(res) {
      res.on('data', function(data) {
        jsonString = data.toString('utf8', 0, data.length);
        jsonObject = JSON.parse(jsonString);
        if (jsonObject.error_description) {
          reject(jsonObject.error_description);
        } else {
          if (jsonObject.access_token && jsonObject.refresh_token) {
            // TODO : add logic here to store access and refresh token against your user_id which would be used to send user profile reports asynchronously
            // when user updates profile information in your app.
            mRefreshToken = jsonObject.refresh_token;
            mAccessToken = jsonObject.access_token;
            mAuthTokens = {
              access_token: mAccessToken,
              refresh_token: mRefreshToken
            };
            resolve(mAuthTokens);
          }
        }
      });
      
      res.on('error', function(e) {
        log('LWA Error', e);
        reject(e);
      });
      
    });
    req.write(post_data);
    req.end();
  })
};

/**
 * Post the user profile report to api.amazonalexa/v1/health/profile endpoint
 */
sendProfileReport = module.exports.sendProfileReport = function(token) {
  log("Access Token is " + mAccessToken);
  return new Promise((resolve, reject) => {
    var jsonString, jsonObject, options = {
      'host': 'api.amazonalexa.com',
      path: '/v1/health/profile',
      method: 'POST',
      headers: {
        'Authorization' : 'Bearer ' + mAccessToken,
        'Content-Type': 'application/json'
      }
    };
    
    var report = JSON.stringify({
      "report": {
        "messageId": "message-id",
        "profiles": [
          {
            "profileId": "test-user-id-1",
            "name": {
              "firstName": "Maggie",
              "lastName": "Simpson",
              "nickNames": ["Maggie", "Margarie"]
            },
            "capabilities": [
              {
                "name": "Alexa.Health.Weight",
                "type": "AlexaInterface",
                "version": "1",
                "supportedOperations": ["Add", "Delete", "Get"]
              },
              {
                "name": "Alexa.Health.DiaperChange",
                "type": "AlexaInterface",
                "version": "1",
                "supportedOperations": ["Add", "Delete", "Get"]
              },
              {
                "name": "Alexa.Health.Sleep",
                "type": "AlexaInterface",
                "version": "1",
                  "supportedOperations": ["Add", "Delete", "Get", "Start", "Stop", "Cancel", "Resume", "Pause"]
              },
              {
                "name": "Alexa.Health.InfantFeeding",
                "type": "AlexaInterface",
                "version": "1",
                "supportedOperations": ["Add", "Delete", "Get", "Start", "Stop", "Cancel", "Resume", "Pause", "Switch"]
                }
            ]
          },
          {
            "profileId": "test-user-id-2",
            "name": {
              "firstName": "Marjorie",
              "lastName": "Simpson",
              "nickNames": ["Bart"]
            },
            "capabilities": [
              {
                "name": "Alexa.Health.BreastPumping",
                "type": "AlexaInterface",
                "version": "1",
                "supportedOperations": ["Add", "Delete", "Start", "Stop", "Cancel", "Pause", "Resume", "Get", "Switch"]
              }
            ]
          }
        ]
      }
    });
    
    log('sendProfileReport', 'requestOptions: ' + stringify(options) + 'report ' + stringify(report) );
    var req = https.request(options, function(res) {
      res.on('data', function(data) {
        jsonString = data.toString('utf8', 0, data.length);
        log("Response received from api.amazonalexa endpoint" + jsonString);
        resolve();
        // TODO : add logic here to gracefully handle the case when sending user profile POST request fails
      });
      
      res.on('error', function(e) {
        log('api.amazonalexa.com endpoint Error', e);
        reject(e);
      });
      
    });
    req.write(report);
    req.end();
  })
};

stringify = module.exports.stringify = function (o) {
    return JSON.stringify(o, null, 2);
};

log = module.exports.log = function (...args) {
    console.log(...args);
};
