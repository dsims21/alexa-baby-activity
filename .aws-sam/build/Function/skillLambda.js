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

var https = require('https');
var querystring = require('querystring');
var aws = require('aws-sdk');
var ddb = new aws.DynamoDB();
var assert = require('assert');
var docClient = new aws.DynamoDB.DocumentClient();

var dataStore = process.env['HEALTH_EVENTS_DATA_STORE'] || 'MockedLambdaDataStore';
var timerDataStore = process.env['TIMER_DATA_STORE'] || 'TimerDataStore';

/**
 * Handle Health Directives
 */
exports.handler = function handler(event, context) {
  log('Getting request:', stringify(event));
  var done = context.succeed;

  handleHealthDirective(event)
    .then(response => done(response))
    .catch((err) => done(generateError('INTERNAL_ERROR', err)));
};

/**
 * Check if Health Directive
 */
isAlexaHealthDirective = exports.isAlexaHealthDirective = function(event) {
  if ((event.directive &&
      event.directive.header &&
      event.directive.header.namespace &&
      event.directive.header.name) &&
    (event.directive.header.namespace.startsWith("Alexa.Health"))) {
    log('Alexa.Health directive found');
    return true;
  } else {
    log('Not an Alexa.Health.* Directive');
    return false;
  }
};

/**
 * Handle health directive
 */
handleHealthDirective = exports.handleHealthDirective = function(event) {
  switch (event.directive.header.name.toLowerCase()) {
    case "add":
      return handleAddOperation(event);
    case "switch":
      return switchTimer(event);
    case "start":
      return startTimer(event);
    case "stop":
      return stopTimer(event);
    case "pause":
      return pauseTimer(event);
    case "cancel":
      return cancelTimer(event);
    case "resume":
      return resumeTimer(event);
    case "get":
      return handleGetOperations(event);
    default:
      return handleUnsupportedOperation(event);
  }
}

handleGetOperations = exports.handleGetOperations = function(event) {
  return new Promise(function(resolve, reject) {
    let payload = stringify(event.directive.payload);
    let interfaceName = event.directive.header.namespace;
    let operationName = event.directive.header.name;
    let userId = event.directive.profile.profileId;

    let response = null;
    let measurementObjectName = null;
    if (interfaceName.includes('Alexa.Health.Weight')) {
      measurementObjectName = 'weightMeasurement';
    } else if (interfaceName.includes('Alexa.Health.InfantFeeding')) {
      measurementObjectName = 'feedingMeasurement';
    } else if (interfaceName.includes('Alexa.Health.BreastPumping')) {
      measurementObjectName = 'breastPumpingMeasurement';
    } else if (interfaceName.includes('Alexa.Health.DiaperChange')) {
      measurementObjectName = 'diaperChangeMeasurement';
    } else if (interfaceName.includes('Alexa.Health.Sleep')) {
      measurementObjectName = 'sleepMeasurement';
    } else {
      response = generateUnsupportedOperationResponse();
      resolve(response);
    }

    let limit = event.directive.payload.queryParameters.maxResults;

    let timeFilter = getTimeFilter(event);
    let typeFilter = getTypeFilter(event);
    let startTime = timeFilter[0];
    let endTime = timeFilter[1];

    getRows(userId, interfaceName, limit, startTime, endTime).then(data => {
      let nextToken = data.LastEvaluatedKey;
      let measurements = convertPayloadToObject(data.Items, measurementObjectName);
      measurements = filterByType(measurements, typeFilter);
      measurements = measurements.slice(0, limit);
      log("Item count: " + data.Items.length + ", returning " + measurements.length);
      response = generateGetResponse(interfaceName, measurements, measurementObjectName, nextToken);
      log(stringify(response));
      resolve(response);
    });
  });
}

getTimeFilter = module.exports.getTimeFilter = function(event) {
    let filterParameters = event.directive.payload.queryParameters.filterParameters;
    let startTime = 0;
    let endTime = new Date().getTime()/1000; //default to current time
    if (filterParameters != null) {
      var filterParameterLength = filterParameters.length;
      for (var i = 0; i < filterParameterLength; i++) {
          try {
            let filterParameter = filterParameters[i];
            if (filterParameter.fieldName == 'measurementTime' || filterParameter.fieldName == 'startTime' )  {
              if (filterParameter.comparisonOperator == 'GTE' || filterParameter.comparisonOperator == 'GT') {
                  startTime = Date.parse(filterParameter.value)/1000;
              } else if (filterParameter.comparisonOperator == 'LT') {
                  endTime = Date.parse(filterParameter.value)/1000;
              }
            }
          }
          catch (err) {
            error(err);
          }
      }
    }
    log('startTime:' + startTime);
    log('endTime', endTime);
    return [startTime, endTime];
}

getTypeFilter = module.exports.getTypeFilter = function(event) {
  let filterParameters = event.directive.payload.queryParameters.filterParameters;
  var typeFilter = null;
  if (filterParameters != null) {
    var filterParameterLength = filterParameters.length;
    for (var i = 0; i < filterParameterLength; i++) {
      let filterParameter = filterParameters[i];
      if (filterParameter.fieldName == 'type' && filterParameter.comparisonOperator == 'EQ') {
        if (filterParameter.value == null) {
          typeFilter = filterParameter.comparisonValue;
        } else {
          typeFilter = filterParameter.value;
        }

      }
    }
  }
  return typeFilter;
}

filterByType = module.exports.filterByType = function(measurements, type) {
  if (type == null) {
    return measurements;
  }
  log('Filtering to ' + type + ' types only.');
  return measurements.filter(measurement => measurement.type === type);
}

getRows = module.exports.getRows = function(userId, interfaceName, limit, startTime, endTime) {
  return new Promise((resolve, reject) => {
    var params = {
      TableName: dataStore,
      KeyConditionExpression: 'userId = :userId and #timestamp BETWEEN :startTime and :endTime',
      FilterExpression: 'interfaceName = :interfaceName',
      ProjectionExpression: '#timestamp,#payload',
      ScanIndexForward: "False", // Return results in descending order by timestamp
      ExpressionAttributeNames: {
        '#timestamp': 'timestamp',
        '#payload': 'payload'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':interfaceName': interfaceName,
        ':startTime': startTime,
        ':endTime': endTime
      }
    };

    return docClient.query(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      }
      else {
        log("Getting data from DDB");
        resolve(data);
      }
    });
  });
}

convertPayloadToObject = module.exports.convertPayloadToObject = function(rows, measurementObjectName) {
  let measurements = []
  rows.forEach(item => {
    measurements.push(JSON.parse(item.payload)[measurementObjectName]);
  });
  return measurements;
}

generateGetResponse = module.exports.generateGetResponse = function(interfaceName, measurements, measurementObjectName, nextToken) {
  let headers = {
    namespace: interfaceName,
    name: 'GetResponse',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {};
  if (nextToken != null) {
    payload['nextToken'] = stringify(nextToken);
  }

  let measurementFieldName = measurementObjectName + 's';
  payload[measurementFieldName] = measurements;

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
}

handleUnsupportedOperation = exports.handleUnsupportedOperation = function(event) {
  return new Promise(function(resolve, reject) {
    log("Operation not supported: " + event.directive.header.name);
    resolve(generateUnsupportedOperationResponse());
  });
}

generateUnsupportedOperationResponse = exports.generateUnsupportedOperationResponse = function() {
  let headers = {
    namespace: 'Alexa.Health',
    name: 'ErrorResponse',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {
    type: 'INVALID_DIRECTIVE',
    message: 'Operation Not supported'
  };

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
}

constructGetTimerDDBParams = stopTimer = exports.constructGetTimerDDBParams = function(userId, interfaceName) {
    let params = {
      TableName: timerDataStore,
      Key: {
        "userId": userId,
        "interfaceName": interfaceName
      },
      ConsistentRead: true
    };
    return params;
}

startTimer = exports.startTimer = function(event) {
  let payload = stringify(event.directive.payload);
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;
  let timestamp = getTimestamp(event.directive.payload.startTime);

  // if not found, start timer
  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        // if existing timer found, return an error
        log(data);
        if (data && data.Item) {
          log("Timer already running");
          resolve(generateTimerAlreadyRunningError('PT25M'));
        } else {
          try {
            saveTimerState(userId, payload, interfaceName, timestamp, "RUNNING");
            resolve(generateTimerResponse(interfaceName, "Start"));
          } catch (err) {
            resolve(generateError("INTERNAL_ERROR", err.message));
          }
        }
      }
    });
  });
}


stopTimer = exports.stopTimer = function(event) {
  let payload = stringify(event.directive.payload);
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;
  let timestamp = getTimestamp(event.directive.payload.stopTime);

  // if not found, start timer
  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        // if existing timer found, return an error
        log(data);
        if (data && data.Item) {
          try {
            docClient.delete(params, function(err, data) {
              if (err) {
                error(err);
                resolve(generateError("INTERNAL_ERROR", "Failed to stop timer."));
              } else {
                resolve(generateTimerResponse(interfaceName, "Stop", {
                  duration: "PT25M14S"
                }));
              }
            });
          } catch (err) {
            resolve(generateError("INTERNAL_ERROR", err.message));
          }
        } else {
          resolve(generateError("TIMER_NOT_RUNNING", "Cannot stop timer, timer not running."));
        }
      }
    });
  });
}

cancelTimer = exports.cancelTimer = function(event) {
  let payload = stringify(event.directive.payload);
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;
  let timestamp = getTimestamp("time");

  // if not found, start timer
  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        // if existing timer found, return an error
        log(data);
        if (data && data.Item) {
          try {
            docClient.delete(params, function(err, data) {
              if (err) {
                error(err);
                resolve(generateError("INTERNAL_ERROR", "Failed to cancel timer."));
              } else {
                resolve(generateTimerResponse(interfaceName, "Cancel"));
              }
            });
          } catch (err) {
            resolve(generateError("INTERNAL_ERROR", err.message));
          }
        } else {
          resolve(generateError("TIMER_NOT_RUNNING", "Cannot cancel timer because timer not running."));
        }
      }
    });
  });
}

pauseTimer = exports.pauseTimer = function(event) {
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;

  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        log(data);
        if (data && data.Item) {
          if (data.Item.timerState !== 'RUNNING') {
            resolve(generateError("TIMER_ALREADY_PAUSED", "Cannot pause timer, timer not running."));
          } else {
            let payload = data.Item.payload;
            let timestamp = getTimestamp("time");
            saveTimerState(userId, payload, interfaceName, timestamp, "PAUSED");
            resolve(generateTimerResponse(interfaceName, "Pause"));
          }
        } else {
          log("No timer found when trying to pause.");
          resolve(generateError("TIMER_NOT_RUNNING", "Cannot pause timer, timer not running."));
        }
      }
    });
  });
}

resumeTimer = exports.resumeTimer = function(event) {
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;

  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        log(data);
        if (data && data.Item) {
          if (data.Item.timerState !== 'PAUSED') {
            resolve(generateError("TIMER_NOT_PAUSED", "Cannot resume timer, timer not paused."));
          } else {
            let payload = data.Item.payload;
            let timestamp = getTimestamp("time");
            saveTimerState(userId, payload, interfaceName, timestamp, "RUNNING");
            resolve(generateTimerResponse(interfaceName, "Resume"));
          }
        } else {
          log("No timer found when trying to pause.");
          resolve(generateError("TIMER_NOT_RUNNING", "Cannot pause timer, timer not running."));
        }
      }
    });
  });
}

switchTimer = exports.resumeTimer = function(event) {
  let interfaceName = event.directive.header.namespace;
  let userId = event.directive.profile.profileId;

  return new Promise(function(resolve, reject) {
    let params = constructGetTimerDDBParams(userId, interfaceName);

    log("Getting timer data from DDB");
    docClient.get(params, function(err, data) {
      if (err) {
        error(err);
        reject(err);
      } else {
        log(data);
        if (data && data.Item) {
          if (data.Item.timerState !== 'RUNNING') {
            resolve(generateError("TIMER_ALREADY_PAUSED", "Cannot switch timer, timer paused."));
          } else {
            let payload = JSON.parse(data.Item.payload);
            //toggle nursing side
            if (payload.nursingStartSide === "LEFT") {
              payload.nursingStartSide = "RIGHT";
            } else {
              payload.nursingStartSide = "LEFT";
            }
            let timestamp = getTimestamp("time");
            saveTimerState(userId, stringify(payload), interfaceName, timestamp, "RUNNING");
            resolve(generateTimerResponse(interfaceName, "Resume", {
                currentNursingSide: payload.nursingStartSide
            }));
          }
        } else {
          log("No timer found when trying to pause.");
          resolve(generateError("TIMER_NOT_RUNNING", "Cannot pause timer, timer not running."));
        }
      }
    });
  });
}

saveTimerState = module.exports.saveTimerState = function(userId, payload, interfaceName, timestamp, timerState) {
  log("Setting timer state in DDB");
  var params = {
    'TableName': timerDataStore,
    'Item': {
      'userId': {
        'S': userId
      },
      'interfaceName': {
        'S': interfaceName
      },
      'payload': {
        'S': payload
      },
      'startTime': {
        'N': timestamp
      },
      'timerState': {
        'S': timerState
      }
    }
  };
  return ddb.putItem(params, function(err, data) {
    if (err) {
      error("ERROR saving timer state to DDB" + err);
      throw (err);
    } else {
      log("SUCCESS saving timer state to DDB");
    }
  }).promise().then(() => info('Writing to DDB completed'));
}

generateTimerResponse = exports.generateTimerResponse = function(namespace, operationName, customPayload = null) {
  let headers = {
    namespace: namespace,
    name: operationName + 'Response',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {};
  if (customPayload != null) {
    payload = customPayload;
  }

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
}

handleAddOperation = exports.handleAddOperation = function(event) {
  log('handleAddOperation:', stringify(event));
  let payload = event.directive.payload;
  let payloadString = stringify(payload);
  let interfaceName = event.directive.header.namespace;
  var userId;
  if (event.directive.endpoint) {
    log('Using old directives that are still referring to endpoint')
    userId = event.directive.endpoint.endpointId;
  } else {
    userId = event.directive.profile.profileId;
  }
  let timestamp = getTimestamp(getMeasurementTime(payload, interfaceName));
  log('userId', userId);
  log('interfaceName', interfaceName);
  log('timestamp', timestamp);
  log('payload', payloadString);
  return appendRow(userId, payloadString, interfaceName, timestamp).then(() => generateAddResponse(interfaceName, userId + '/' + timestamp))
}

getMeasurementTime = exports.handleAddOperation = function(payload, interfaceName) {
    switch(interfaceName) {
        case "Alexa.Health.Sleep":
            return payload.sleepMeasurement.startTime;
        case "Alexa.Health.Weight":
            return payload.weightMeasurement.measurementTime;
        case "Alexa.Health.DiaperChange":
            return payload.diaperChangeMeasurement.measurementTime;
        case "Alexa.Health.BreastPumping":
            return payload.breastPumpingMeasurement.startTime;
        case "Alexa.Health.InfantFeeding":
            return payload.feedingMeasurement.startTime;
        default:
            return new Date().toString();
    }
}

generateAddResponse = exports.generateAddResponse = function(namespace, entryId) {
  let headers = {
    namespace: namespace,
    name: 'AddResponse',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {
    entryId: entryId
  };

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
}

appendRow = module.exports.appendRow = function(userId, payload, interfaceName, timestamp) {
  log("Appending Health Event to DDB");
  var params = {
    'TableName': dataStore,
    'Item': {
      'userId': {
        'S': userId
      },
      'timestamp': {
        'N': timestamp
      },
      'interfaceName': {
        'S': interfaceName
      },
      'payload': {
        'S': payload
      }
    }
  };
  return ddb.putItem(params, function(err, data) {
    if (err) {
      error("ERROR While saving health event to DynamoDB: " + err);
    } else {
      log("SUCCESS saving health event to DDB");
    }
  }).promise().then(() => info('Writing to DDB completed'));
}

/** Check that to objects are equal (Ie that have the same properties */
checkObjectsHaveEqualProperties = module.exports.checkObjectsHaveEqualProperties = function(obj1, obj2) {
  try {
    assert.deepEqual(obj1, obj2, 'NotEqualAssertion');
  } catch (error) {
    if (error.message === 'NotEqualAssertion') {
      return false;
    }
    throw error;
  }
  return true;
};

/** Create an error object to return to the caller. */
generateError = module.exports.generateError = function(code, description) {
  let headers = {
    namespace: 'Alexa.Health',
    name: 'ErrorResponse',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {
    type: code,
    message: description,
  };

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
};

generateTimerAlreadyRunningError = module.exports.generateTimerAlreadyRunningError = function(elapsedTime) {
  let headers = {
    namespace: 'Alexa.Health',
    name: 'ErrorResponse',
    payloadVersion: '1',
    messageId: 'message-id-001'
  };

  let payload = {
    type: 'TIMER_ALREADY_RUNNING',
    message: 'Timer already running.',
    elapsedTime: elapsedTime
  };

  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
};

getTimestamp = module.exports.getTimestamp = function(dateString) {
  let timestamp = (Date.parse(dateString)/1000).toString();
  if (isNaN(timestamp)) {
    error('Defaulting to current time');
    timestamp = (Math.round((new Date()).getTime() / 1000)).toString();
  }
  log(`DateString:${dateString} -> Timestamp:${timestamp}`)
  return timestamp;
}

log = module.exports.log = function(...args) {
  console.log(...args);
};

info = module.exports.info = function(...args) {
  console.info(...args);
};

error = module.exports.error = function(...args) {
  console.error(...args);
};

stringify = module.exports.stringify = function(o) {
  return JSON.stringify(o, null, 2); // indent with 2 spaces
};