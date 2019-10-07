'use-strict';
require('../model/ddb/queryRequest.js')
require('../model/ddb/healthMeasurementKey.js')
var healthMeasurement = require('../model/ddb/healthMeasurement.js')
var QueryResponse = require('../model/ddb/queryResponse.js')
var aws = require('aws-sdk');
var ddb = new aws.DynamoDB();
var docClient = new aws.DynamoDB.DocumentClient();
const HEALTH_MEASUREMENT_DDB_TABLE_NAME = "HealthMeasurements";

/*
  CRUD operations for HealthMeasurements ddb datastore.

  DDB table has the following schema:
    HashKey: id (id will be of form 'userId/interfaceName')
    RangeKey: timestamp
    Attributes: {
      userId: baby user id
      interfaceName: alexaHealthInterfaceName
      payload: health measurement specific payload
      state: state of health measurement (can be CREATED, RUNNING, PAUSED)
    }
*/

/*
   Query health events for user, interfaceName and other filter parameters.
   See QueryRequest.js for attributes and their purpose.
*/
exports.queryHealthMeasurements = function(queryRequest) {
    console.log("querying ddb, queryRequest:", JSON.stringify(queryRequest, null, 2))
    return new Promise((resolve, reject) => {
        queryDDB(queryRequest).then(data => {
          let healthMeasurementsPayload = [];
          data.Items.forEach(ddbItem => {
            healthMeasurementPayload = healthMeasurement.payloadFromDDBItem(ddbItem,
              queryRequest.healthMeasurementPayloadKey);
            healthMeasurementsPayload.push(healthMeasurementPayload)
          });

          if (queryRequest.healthMeasurementPayloadTypeFilter != null) {
            healthMeasurementsPayload.filter(payload =>
              payload.type === queryRequest.healthMeasurementPayloadTypeFilter);
          }
          healthMeasurementsPayload = healthMeasurementsPayload.slice(0, queryRequest.maxResults)
          console.log("Items found in ddb: " + data.Items.length +
            ", HealthMeasurements result size after applying filters: " + healthMeasurementsPayload.length);
          response = new QueryResponse(healthMeasurementsPayload,
            JSON.stringify(data.nextToken, null, 2));
          resolve(response);
        });
      });
    }

    /*
     Save health measurement to ddb table.
    */
    exports.saveHealthMeasurement = function(healthMeasurement) {
      console.log("Saving health measurement:", healthMeasurement);
      var params = {
        'TableName': HEALTH_MEASUREMENT_DDB_TABLE_NAME,
        'Item': {
          'id': {
            'S': healthMeasurement.key.id
          },
          'timestamp': {
            'N': healthMeasurement.timestamp.toString()
          },
          'userId': {
            'S': healthMeasurement.key.babyUserId
          },
          'interfaceName': {
            'S': healthMeasurement.key.interfaceName
          },
          'payload': {
            'S': healthMeasurement.payload
          },
          'state': {
            'S': healthMeasurement.state
          }
        }
      };
      return ddb.putItem(params, function(err, data) {
        if (err) {
          console.error(err);
          reject(err)
        } else {
          console.log("SUCCESS saving health measurement to DDB");
        }
      }).promise().then(() => console.info('Writing to DDB completed'));
    }

    /*
      Get latest health measurement for healthMeasurementKey(userId, interfaceName)
    */
    exports.getLatestHealthMeasurement = function(healthMeasurementKey) {
      return new Promise((resolve, reject) => {
          queryDDBLatest(healthMeasurementKey).then(data => {
            timerHealthMeasurementObj = null
            if (data.Items.length > 0) {
              timerHealthMeasurementObj = healthMeasurement.fromDDBItem(data.Items[0])
            }
        resolve(timerHealthMeasurementObj)
        });
      });
    }

    exports.deleteHealthMeasurement = function(healthMeasurementKey, timestamp) {
      let params = {
        TableName: HEALTH_MEASUREMENT_DDB_TABLE_NAME,
        Key: {
          "id": healthMeasurementKey.id,
          "timestamp": timestamp
        }
      };
      return new Promise((resolve, reject) => {
        docClient.delete(params, function(err, data) {
         if (err) {
           console.error(err);
           reject(err);
         } else {
           console.log("SUCCESS deleting health measurement.");
           resolve(true)
         }
       });
      });
    }

    queryDDB = function(queryRequest) {
      return new Promise((resolve, reject) => {
        var params = {
          TableName: HEALTH_MEASUREMENT_DDB_TABLE_NAME,
          KeyConditionExpression: 'id = :id and #timestamp BETWEEN :startTime and :endTime',
          ProjectionExpression: '#timestamp,#payload',
          ScanIndexForward: "False", // Return results in descending order by timestamp
          ExpressionAttributeNames: {
            '#timestamp': 'timestamp',
            '#payload': 'payload'
          },
          ExpressionAttributeValues: {
            ':id': queryRequest.key.id,
            ':startTime': queryRequest.startTimeFilter,
            ':endTime': queryRequest.endTimeFilter
          }
        };

        return docClient.query(params, function(err, data) {
          if (err) {
            console.error(err);
            reject(err);
          } else {
            console.log("SUCCESS querying data from DDB");
            resolve(data);
          }
        });
      });
    }
    // this function is expected to be used within this class.
    queryDDBLatest = function(healthMeasurementKey) {
      return new Promise((resolve, reject) => {
        var params = {
          TableName: HEALTH_MEASUREMENT_DDB_TABLE_NAME,
          KeyConditionExpression: 'id = :id',
          ScanIndexForward: "False", // Return results in descending order by timestamp
          ExpressionAttributeValues: {
            ':id': healthMeasurementKey.id
          }
        };

        return docClient.query(params, function(err, data) {
          if (err) {
            console.error(err);
            reject(err);
          } else {
            console.log("SUCCESS querying data from DDB");
            resolve(data);
          }
        });
      });
    }
