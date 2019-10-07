'use strict';
require('../model/ddb/queryRequest.js');
require('../model/ddb/queryResponse.js');

/*
  Build new add skill response.  See following for add response examples
  1. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/InfantFeedingInterface/InfantFeeding.Add.response.json
  2. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/DiaperChangeInterface/DiaperChange.Add.response.json
*/
exports.newAddResponse = function(namespace, entryId) {
  let payload = {
    entryId: entryId
  };
  return newResult(newHeaders(namespace, 'AddOperation'), payload);
}

exports.newTimerResponse = function(namespace, operationName, customPayload = null) {
  let payload = {};
  if (customPayload != null) {
    payload = customPayload;
  }
  return newResult(newHeaders(namespace, operationName + 'Response'), payload)
}

exports.newUnsupportedOperationResponse = function() {
  let payload = {
    type: 'INVALID_DIRECTIVE',
    message: 'Operation Not supported'
  };
  return newResult(newErrorHeaders(), payload);
}

/*
  Build new get skill response.  See following for get response examples
  1. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/InfantFeedingInterface/InfantFeeding.Get.response.json
  2. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/DiaperChangeInterface/DiaperChange.Get.response.json
  3. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/WeightInterface/Weight.Get.response.json
  4. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/SleepInterface/Sleep.Get.response.json
*/
exports.newGetResponse = function(queryRequest, queryResponse) {
  let payload = {};
  if (queryResponse.nextToken != null) {
    payload['nextToken'] = queryResponse.nextToken;
  }
  payload[queryRequest.healthMeasurementPayloadKey + 's'] = queryResponse.healthMeasurementsPayload;
  return newResult(newHeaders(queryRequest.interfaceName, 'GetResponse'), payload);
}

exports.newErrorResponse = function(code, description) {
  let payload = {
    type: code,
    message: description,
  };
  return newResult(newErrorHeaders(), payload)
}

exports.newTimerAlreadyRunningErrorResponse = function(elapsedTime) {
  let payload = {
    type: 'TIMER_ALREADY_RUNNING',
    message: 'Timer already running.',
    elapsedTime: elapsedTime
  };
  return newResult(newErrorHeaders(), payload);
}

var newHeaders = function(namespace, operationName) {
  let headers = {
    namespace: namespace,
    name: operationName,
    payloadVersion: '1',
    messageId: 'message-id-001'
  };
  return headers;
}

var newErrorHeaders = function() {
  return newHeaders('Alexa.Health', 'ErrorResponse');
}

var newResult = function(headers, payload) {
  var result = {
    event: {
      header: headers,
      payload: payload
    }
  };
  return result;
}
