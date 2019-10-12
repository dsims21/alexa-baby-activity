'use strict';
var HealthMeasurementKey = require('./healthMeasurementKey.js')
var healthInterfaceNames = require('../../lib/healthInterfaceNames.js')
/*
  Represents a healthMeasurement record in DDB.

  Following are the attributes.
  key - healthMeasurementKey, identifies a particular type of healthMeasurements associated with a user.
  timestamp - time associated with health measurement.
  payload - healthMeasurement specific payload. For example, in case of DiaperChange,
            the payload might contain the type: Wet, mixed, dirty etc. For infant feeding,
            the payload might contain the nursing side.
  state - state of health measurement, can be one of CREATED, RUNNING, PAUSED
          depending on type of health measurement. RUNNING, PAUSED are used by timer health measurements
          such as sleep and infant feeding.
*/
module.exports = class HealthMeasurement {

  constructor(healthMeasurementKey, timestamp, payload, state) {
    this.key = healthMeasurementKey;
    this.timestamp = parseInt(timestamp);
    this.payload = payload;
    this.state = state;
  }

  static fromLambdaEvent(event) {
    let healthMeasurementKey = HealthMeasurementKey.fromLambdaEvent(event)
    let payload = event.directive.payload;
    let timestamp = getTimestamp(getMeasurementTime(payload, healthMeasurementKey.interfaceName));
    return new HealthMeasurement(healthMeasurementKey, timestamp,
      JSON.stringify(payload, null, 2), 'CREATED');
  }

  static payloadFromDDBItem(ddbItem, measurementPayloadName) {
    return JSON.parse(ddbItem.payload)[measurementPayloadName];
  }

  static fromDDBItem(ddbItem) {
    let healthMeasurementKey = new HealthMeasurementKey(ddbItem.userId, ddbItem.interfaceName)
    return new HealthMeasurement(healthMeasurementKey, ddbItem.timestamp,
    ddbItem.payload, ddbItem.state)
  }
}

var getMeasurementTime = function(payload, interfaceName) {
  switch (interfaceName) {
    case healthInterfaceNames.SLEEP:
      return payload.sleepMeasurement.startTime;
    case healthInterfaceNames.WEIGHT:
      return payload.weightMeasurement.measurementTime;
    case healthInterfaceNames.DIAPER_CHANGE:
      return payload.diaperChangeMeasurement.measurementTime;
    case healthInterfaceNames.INFANT_FEEDING:
      return payload.feedingMeasurement.startTime;
    default:
      return new Date().toString();
  }
}

var getTimestamp = function(dateString) {
  let timestamp = (Date.parse(dateString) / 1000).toString();
  if (isNaN(timestamp)) {
    error('Defaulting to current time');
    timestamp = (Math.round((new Date()).getTime() / 1000)).toString();
  }
  log(`DateString:${dateString} -> Timestamp:${timestamp}`)
  return timestamp;
}
