'use strict';
var healthInterfaceNames = require('../../lib/healthInterfaceNames.js')
var HealthMeasurementKey = require('./healthMeasurementKey.js')

/*
  Represents a healthMeasurement DDB query request.
  Following are the attributes:
  key - healthMeasurementKey, identifies a particular type of healthMeasurements associated with a user.
  healthMeasurementPayloadKey -  healthMeasurement payload json object for a particular AlexaHealth.Interface appears under
                                 a key name that is specific to that interface. For eg: Alexa.Health.Weight interface's payload appears as {weightMeasurement: <payload fielgs>}, here
                                 'weightMeasurement'. This attribute describes object key name of payload json.
  healthMeasurementPayloadTypeFilter - Certain healthMeasurement payload has a specific type associated with it. For eg:
                                        Alexa.Health.DiaperChange can have type as DIRTY, WET etc. When customer asks Alexa
                                        to get wet/dirty diaper changes, AlexaService will send a query request to skill with
                                        this type filter filled.
  startTimeFilter,endTimeFilter - time interval within which the health measurements must be queried.
  maxResults - maximum count of health measurements to be returned.

*/
module.exports = class QueryRequest {
  constructor(healthMeasurementKey, healthMeasurementPayloadKey,
    healthMeasurementPayloadTypeFilter, startTimeFilter, endTimeFilter, maxResults) {
    this.key = healthMeasurementKey;   // uniqueId to identify a particular health measurements for user
    this.healthMeasurementPayloadKey = healthMeasurementPayloadKey;
    this.healthMeasurementPayloadTypeFilter = healthMeasurementPayloadTypeFilter;
    this.startTimeFilter = startTimeFilter;
    this.endTimeFilter = endTimeFilter;
    this.maxResults = maxResults;
  }

  /*
    builds and returns a ddb query request object from lambda event.

    See following for sample get requests for 4 AlexaHealth interfaces
    1. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/DiaperChangeInterface/DiaperChange.Get.request.json
    2. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/InfantFeedingInterface/InfantFeeding.Get.request.json
    3. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/WeightInterface/Weight.Get.request.json
    4. https://github.com/alexa/alexa-baby-activity/blob/master/sample_messages/SleepInterface/Sleep.Get.request.json

    See following to understand more about querying
    1. https://developer.amazon.com/docs/health/filtering-and-sorting.html#query-examples
  */
  static fromLambdaEvent(event) {
    let interfaceName = event.directive.header.namespace;
    let maxResults = event.directive.payload.queryParameters.maxResults;
    let userId = event.directive.profile.profileId;
    let timeFilter = getTimeFilter(event);
    let healthMeasurementPayloadTypeFilter = getHealthMeasurementPayloadTypeFilter(event);
    let healthMeasurementPayloadKey = null;

    if (interfaceName.includes(healthInterfaceNames.WEIGHT)) {
      healthMeasurementPayloadKey = 'weightMeasurement';
    } else if (interfaceName.includes(healthInterfaceNames.INFANT_FEEDING)) {
      healthMeasurementPayloadKey = 'feedingMeasurement';
    } else if (interfaceName.includes(healthInterfaceNames.DIAPER_CHANGE)) {
      healthMeasurementPayloadKey = 'diaperChangeMeasurement';
    } else if (interfaceName.includes(healthInterfaceNames.SLEEP)) {
      healthMeasurementPayloadKey = 'sleepMeasurement';
    }
    return new QueryRequest(new HealthMeasurementKey(userId, interfaceName),
      healthMeasurementPayloadKey,
      healthMeasurementPayloadTypeFilter,
      timeFilter[0], timeFilter[1], maxResults)
  }
}

/*
  Gets requested startTime, endTime to query health measurements.
  Time filter defaults to beginning to current time if no time filter is
  provided.

  See https://developer.amazon.com/docs/health/filtering-and-sorting.html#filter-parameters
  for more details.
*/
var getTimeFilter = function(event) {
  let filterParameters = event.directive.payload.queryParameters.filterParameters;
  let startTime = 0;
  let endTime = new Date().getTime() / 1000; //default to current time
  if (filterParameters == null) {
    return [startTime, endTIme];
  }
  filterParameters.forEach(filterParameter => {
    try {
      if (filterParameter.fieldName == 'measurementTime' || filterParameter.fieldName == 'startTime') {
        if (filterParameter.comparisonOperator == 'GTE' || filterParameter.comparisonOperator == 'GT') {
          startTime = Date.parse(filterParameter.value) / 1000;
        } else if (filterParameter.comparisonOperator == 'LT') {
          endTime = Date.parse(filterParameter.value) / 1000;
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
  return [startTime, endTime];
}

/*
  Gets payloadType to filter the health measurement records.
*/
var getHealthMeasurementPayloadTypeFilter = function(event) {
  let filterParameters = event.directive.payload.queryParameters.filterParameters;
  var typeFilter = null;
  if (filterParameters == null) {
    return typeFilter;
  }
  filterParameters.forEach(filterParameter => {
    if (filterParameter.fieldName == 'type' && filterParameter.comparisonOperator == 'EQ') {
      typeFilter = filterParameter.value == null ? filterParameter.comparisonValue :
        filterParameter.value;
    }
  });
  return typeFilter;
}
