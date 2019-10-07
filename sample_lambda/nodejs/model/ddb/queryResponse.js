'use strict';
/*
 Represents ddb query response. Note: This is not actual skill reponse to Alexa.
 See lib/skillResponse for details on actual skill response.
*/
module.exports = class QueryResponse {
  constructor(healthMeasurementsPayload, nextToken) {
    this.healthMeasurementsPayload = healthMeasurementsPayload
    this.nextToken = nextToken
  }
}
