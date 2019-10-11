/**
 * Copyright 2019 Amazon.com, Inc. and its affiliates. All Rights Reserved.

 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at

 * http://aws.amazon.com/asl/

 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
**/

/**
 * Lambda handler that process baby activity health skill request.
 * This is the entry point to skill.
 */
var healthMeasurementsDao = require('./lib/healthMeasurementDao.js');
var healthMeasurement = require('./model/ddb/healthMeasurement.js');
var healthMeasurementKey = require('./model/ddb/healthMeasurementKey.js');
var queryRequest = require('./model/ddb/queryRequest.js');
var skillResponse = require('./lib/skillResponse.js');
require('./model/ddb/queryResponse.js');

exports.handler = function healthSkillRequestHandler(event, context) {
  log('Processing request:', stringify(event));
  var done = context.succeed;
  handleHealthDirective(event)
    .then(response => done(response))
    .catch((err) => {
      error(err);
      done(skillResponse.newErrorResponse('INTERNAL_ERROR', err))
    });
};

/*
   An interface describes a fuctionality or a health measurement supported by the skills kit.
   Alexa health supports four interfaces as of now: Weight, Sleep, DiaperChange, InfantFeeding.

   A directive describes an operation that can be performed against an interface. Alexa Health supports
   following directives: add, get, start, stop, pause, cancel, switch. Out of these 7 directives
    1. add,get directives can be performed against all four interfaces.
    2. start, stop, pause, cancel can be perfomed only against Sleep and InfantFeeding interfaces.
    3. switch can be performed only against InfantFeeding interface.

    See: https://developer.amazon.com/docs/health/overview.html#interfaces to learn
    about interfaces and directives.

    Following method identifies the directive in the request invokes corresponding directive handler.
 */
handleHealthDirective = exports.handleHealthDirective = function(event) {
  var healthDirectiveName = event.directive.header.name.toLowerCase()
  switch (healthDirectiveName) {
    case "add":
      return handleAddDirective(event);
    case "get":
      return handleGetDirective(event);
    case "start":
      return handleStartDirective(event);
    case "stop":
      return handleStopDirective(event);
    case "pause":
      return handlePauseDirective(event);
    case "resume":
      return handleResumeDirective(event);
    case "cancel":
      return handleCancelDirective(event);
    case "switch":
      return handleSwitchDirective(event);
    default:
      return handleUnsupportedDirective(event);
  }
}

/*
  Alexa Service invokes the skill with add directive when customer requests Alexa
  to add a new healthMeasurement.

  For example:
    Alexa, track weight of ten point two five pounds this morning.
    Alexa, record sleep at ten am.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a add request,
  creates a healthMeasurement record for baby-user-id, healthMeasurement, timestamp and other measurement
  specific payload.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-weight.html#add-directive
  2. https://developer.amazon.com/docs/health/alexa-health-diaperchange.html#add-directive
  3. https://developer.amazon.com/docs/health/alexa-health-sleep.html#add-directive
  4. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#add-directive
*/
handleAddDirective = exports.handleAddDirective = function(event) {
  newHealthMeasurement = healthMeasurement.fromLambdaEvent(event)
  return healthMeasurementsDao.saveHealthMeasurement(newHealthMeasurement)
    .then(() => skillResponse.newAddResponse(newHealthMeasurement))
}

/*
  Alexa Service invokes the skill with get directive whenever customer requests
  to list details of health measurement tracked in the past.

  For example:
    Alexa, what is the baby’s weight?
    Alexa, how long did my baby sleep yesterday?

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a get request,
  queries the dynamodb table for requested baby-user-id, healthMeasurement, other filter parameters and
  returns the response.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-weight.html#get-directive
  2. https://developer.amazon.com/docs/health/alexa-health-diaperchange.html#get-directive
  3. https://developer.amazon.com/docs/health/alexa-health-sleep.html#get-directive
  4. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#get-directive
*/
handleGetDirective = exports.handleGetDirective = function(event) {
  return new Promise(function(resolve, reject) {
    info("Building query request from lambda event")
    let queryRequestObj = queryRequest.fromLambdaEvent(event);
    if (queryRequestObj.healthMeasurementPayloadKey == null) {
      resolve(skillResponse.newUnsupportedOperationResponse());
    }
    healthMeasurementsDao.queryHealthMeasurements(queryRequestObj).then(queryResponse => {
      resolve(skillResponse.newGetResponse(queryRequestObj, queryResponse));
    });
  });
}

/*
  Alexa Service invokes the skill with start directive when a customer requests
  to start a timer health measurement such as Sleep, InfantFeeding.

  For example:
    Alexa, start the feeding for Jane.
    Alexa, start sleep for John starting ten minutes ago.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a start request,
  creates and starts a Sleep or Nursing timer for baby-user-id with timer health measurement specific payload.

  If a timer is already running, the skill will respond with TimerAlreadyRunning error with elapsed duration
  of currently actively timer. In sample, the duration of a timer is not tracked, it responds with a
  hardcoded value of 25 minutes. In production, the skill must track the duration and
  return the elapsed duration of active timer when customer attempts to start a timer when a timer is
  already running.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-sleep.html#start-directive
  2. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#start-directive
*/
handleStartDirective = exports.handleStartDirective = function(event) {
  let newTimerHealthMeasurement = healthMeasurement.fromLambdaEvent(event)
  return new Promise(function(resolve, reject) {
    healthMeasurementsDao.getLatestHealthMeasurement(newTimerHealthMeasurement.key).then(existingTimerHealthMeasurement => {
      if (existingTimerHealthMeasurement == null) {
        newTimerHealthMeasurement.state = 'RUNNING';
        healthMeasurementsDao.saveHealthMeasurement(newTimerHealthMeasurement)
        resolve(skillResponse.newTimerResponse(newTimerHealthMeasurement.key.interfaceName, "Start"))
      } else {
        log("Timer already running");
        resolve(skillResponse.newTimerAlreadyRunningErrorResponse('PT25M'));
      }
    });
  });
}

/*
  Alexa Service invokes the skill with stop directive when a customer is done with timer health measurement
  activity(Sleep,InfantFeeding) and requests Alexa to stop the timer that was started earlier.

  For example:
    Alexa, John woke up ten minutes ago.
    Alexa, start sleep for John starting ten minutes ago.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a stop request, checks if a timer exists
  already for requested baby-user-id and timer health measurement type in datastore. If found, the sample skill stops
  tracking the timer by deleting the healthMeasurement record from datastore, if not returns
  TIMER_NOT_RUNNING error response.

  For now, the skill does not track the duration of a timer. It just returns a hardcoded
  response of 25 minutes and 14 seconds. In production, the skill must track the duration and
  return the elapsed duration when when timer is stopped.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-sleep.html#stop-directive
  2. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#stop-directive
*/
handleStopDirective = exports.handleStopDirective = function(event) {
  return deleteStartedTimer(event, "Stop", {
    duration: "PT25M14S"
  })
}

/*
  Alexa Service invokes the skill with cancel directive when a customer no longer wants to
  track a Sleep/InfrantFeeding and requests Alexa to cancel a timer that was started earlier.

  For example:
    Alexa, cancel sleep for Jane.
    Alexa, cancel feeding.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a cancel request, checks if a timer exists
  already for requested baby-user-id and timer health measurement type in datastore. If found, the sample skill cancel
  tracking the timer by deleting the healthMeasurement record from datastore, if not returns
  TIMER_NOT_RUNNING error response.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-sleep.html#cancel-directive
  2. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#cancel-directive
*/
handleCancelDirective = exports.handleStopDirective = function(event) {
  return deleteStartedTimer(event, "Cancel", null)
}

deleteStartedTimer = exports.deleteStartedTimer = function(event, action, responsePayload) {
  let healthMeasurementKeyObj = healthMeasurementKey.fromLambdaEvent(event)
  return new Promise(function(resolve, reject) {
    healthMeasurementsDao.getLatestHealthMeasurement(healthMeasurementKeyObj)
      .then(existingTimerHealthMeasurement => {
        if (existingTimerHealthMeasurement == null) {
          resolve(skillResponse.newErrorResponse("TIMER_NOT_RUNNING", "Cannot " + action + " timer, timer not running."));
        } else {
          healthMeasurementsDao.deleteHealthMeasurement(existingTimerHealthMeasurement.key, existingTimerHealthMeasurement.timestamp)
            .then(deleteSucceded => {
              if (deleteSucceded !== true) {
                resolve(skillResponse.newErrorResponse("INTERNAL_ERROR", "Failed to " + action + " timer."));
              } else {
                let interfaceName = healthMeasurementKeyObj.interfaceName;
                response = responsePayload == null ? skillResponse.newTimerResponse(interfaceName, action)
                 : skillResponse.newTimerResponse(interfaceName, action, responsePayload);
                resolve(response);
              }
            });
        }
      });
  });
}

/*
  Alexa Service invokes the skill with pause directive when a customer wants to temporarily
  pause a timer health measurement activity(Sleep,InfantFeeding) and requests Alexa to pause
  the timer that was started earlier.

  For example:
    Alexa, pause feeding.
    Alexa, pause sleep for Jane ten minutes ago.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a pause request, checks if a timer exists
  already for requested baby-user-id and timer health measurement type in datastore. If found, the sample skill
  sets the state of healthMeasurementRecord to 'PAUSED', if not returns TIMER_NOT_RUNNING error response.

  In sample skill, pause/resume does not have a impact on duration. In production, pause/resume
  should be handled such that duration when timer is paused is not counted towards total timer duration.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-sleep.html#pause-directive
  2. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#pause-directive
*/
handlePauseDirective = exports.handlePauseDirective = function(event) {
  let healthMeasurementKeyObj = healthMeasurementKey.fromLambdaEvent(event)
  return new Promise(function(resolve, reject) {
    healthMeasurementsDao.getLatestHealthMeasurement(healthMeasurementKeyObj)
    .then(existingTimerHealthMeasurement => {
      if (existingTimerHealthMeasurement == null) {
        resolve(skillResponse.newErrorResponse("TIMER_NOT_RUNNING", "Cannot pause timer, timer not running."));
      } else if (existingTimerHealthMeasurement.state !== 'RUNNING') {
        log("Timer already running");
        resolve(skillResponse.newErrorResponse("TIMER_ALREADY_PAUSED", "Cannot pause timer, timer already paused.")); // FIXME ???
      } else {
        console.log("existing health measurement event:", stringify(existingTimerHealthMeasurement));
        existingTimerHealthMeasurement.state = 'PAUSED';
        healthMeasurementsDao.saveHealthMeasurement(existingTimerHealthMeasurement)
        resolve(skillResponse.newTimerResponse(healthMeasurementKeyObj.interfaceName, "Pause"));
      }
    });
  });
}

/*
  Alexa Service invokes the skill with resume directive when a customer wants to
  resume a timer health measurement activity(Sleep,InfantFeeding) that was paused temporarily
  earlier.

  For example:
    Alexa, resume sleep for Jane.
    Alexa, resume feeding.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a resume request, checks if a timer exists
  for requested baby-user-id and timer health measurement type in datastore and if it is in paused state.
  If found, the sample skill sets the state of healthMeasurementRecord back to 'RUNNNIG'. if not, returns
  TIMER_NOT_RUNNING or TIMER_NOT_PAUSED error response depending on timer state.

  In sample skill, pause/resume does not have a impact on duration. In production, pause/resume
  should be handled such that duration when timer is paused is not counted towards total timer duration.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-sleep.html#resume-directive
  2. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#resume-directive
*/
handleResumeDirective = exports.handleResumeDirective = function(event) {
  let healthMeasurementKeyObj = healthMeasurementKey.fromLambdaEvent(event)
  return new Promise(function(resolve, reject) {
    healthMeasurementsDao.getLatestHealthMeasurement(healthMeasurementKeyObj)
      .then(existingTimerHealthMeasurement => {
        if (existingTimerHealthMeasurement == null) {
          resolve(skillResponse.newErrorResponse("TIMER_NOT_RUNNING", "Cannot pause timer, timer not running."));
        } else if (existingTimerHealthMeasurement.state !== 'PAUSED') {
          log("Timer already running");
          resolve(skillResponse.newErrorResponse("TIMER_NOT_PAUSED", "Cannot resume timer, timer not paused.")); // FIXME ???
        } else {
          existingTimerHealthMeasurement.state = 'RUNNING';
          healthMeasurementsDao.saveHealthMeasurement(existingTimerHealthMeasurement)
          resolve(skillResponse.newTimerResponse(healthMeasurementKeyObj.interfaceName, "Resume"));
        }
      });
  });
}

/*
  Alexa Service invokes the skill with switch directive when a customer is tracking
  a nursing activity(InfantFeeding) wants to switch the side when nursing in progress.

  For example:
  Alexa, switch sides.

  Sample baby activity skill tracks 4 supported measurements(Weight, DiaperChange, Sleep, InfantFeeding)
  in a Dynamo DB table. Sample baby activity skill, on receiving a switch request, checks if a infant feeding timer exists
  for requested baby-user-id in datastore and if it is currently active.
  If found, the sample skill, records the nursing side switch in health measurement record payload and
  persists in datastore. if not, returns TIMER_NOT_RUNNING or TIMER_ALREADY_PAUSED error response depending on timer state.

  See following links for more details about the directive
  1. https://developer.amazon.com/docs/health/alexa-health-infantfeeding.html#switch-directive
*/
handleSwitchDirective = exports.handleResumeDirective = function(event) {
  let healthMeasurementKeyObj = healthMeasurementKey.fromLambdaEvent(event)

  return new Promise(function(resolve, reject) {
    healthMeasurementsDao.getLatestHealthMeasurement(healthMeasurementKeyObj)
      .then(existingHealthMeasurement => {
        if (existingHealthMeasurement == null) {
          resolve(skillResponse.newErrorResponse("TIMER_NOT_RUNNING", "Cannot switch timer, timer not running."));
        } else if (existingHealthMeasurement.state !== 'RUNNING') {
          resolve(skillResponse.newErrorResponse("TIMER_ALREADY_PAUSED", "Cannot switch timer, timer paused."));
        } else {
          let payloadJson = JSON.parse(existingHealthMeasurement.payload);
          let newNursingSide = payloadJson.nursingStartSide === "LEFT" ? 'RIGHT' : 'LEFT'
          payloadJson.nursingStartSide = newNursingSide
          existingHealthMeasurement.payload = stringify(payloadJson)
          healthMeasurementsDao.saveHealthMeasurement(existingHealthMeasurement);
          resolve(skillResponse.newTimerResponse(healthMeasurementKeyObj.interfaceName, "Resume", {
            currentNursingSide: payloadJson.nursingStartSide
          }));
        }
      });
  });
}

/*
  Sample skill returns error response if an unknown directive and heath measurement type
  (or AlexaHealth interface type) is received.
*/
handleUnsupportedDirective = exports.handleUnsupportedDirective = function(event) {
  return new Promise(function(resolve, reject) {
    log("Operation not supported: " + event.directive.header.name);
    resolve(skillResponse.newUnsupportedOperationResponse());
  });
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
