'use strict';

/*
  Represents a DDB hash key used to identify a health measurement record.
  The key is composed of following attributes,
  babyUserId: unique id identifying baby.
  interfaceName: name of alexa health interface (Weight, InfantFeeding, Sleep, DiaperChange)
*/
module.exports = class HealthMeasurementKey {
  constructor(babyUserId, interfaceName) {
    this.babyUserId = babyUserId;
    this.interfaceName = interfaceName;
    this.id = babyUserId + "/" + interfaceName;
  }

  static fromLambdaEvent(event) {
    let userId = event.directive.profile.profileId;
    let interfaceName = event.directive.header.namespace;
    let id = userId + "/" + interfaceName;
    return new HealthMeasurementKey(userId, interfaceName, id);
  }
}
