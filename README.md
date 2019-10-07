# Alexa Baby Activity Skill Sample
The code sample along with AWS Cloud Formation template builds the required infrastructure and launches a baby activity skill that was built using [alexa baby activity skills kit](https://developer.amazon.com/docs/health/overview.html).

The sample baby activity skill supports following use cases.
* Log and Query diaper changes.
* Log and Query feeding.
* Log and Query weight.
* Start, Stop, Pause, Query and Switch single nursing timer at a time.
* Start, Stop, Pause and Query a single single sleep timer at a time.

See [alexa baby activity skills kit](https://developer.amazon.com/docs/health/overview.html) for sample utterances that can be used to invoke the skill.

## Getting Started
### Prerequisites
* AWS account
* Oauth server with reciprocalToken endpoint setup to publish baby activity user profiles to Alexa during account linking. You can follow [alexa-baby-activity-account-linking-sample](https://github.com/alexa/alexa-oauth-sample) to setup oauth server for baby activity skills account linking easily.
* Sample baby activity skill created in Alexa skill console with Account linking section filled with required fields. You should have account linking setup already if you followed [alexa-baby-activity-account-linking-sample](https://github.com/alexa/alexa-oauth-sample).

### Design
![HLD](images/sample-baby-activity-skill-hld.png)
#### Data model

###### HealthMeasurement
   Represents a health measurement related to a user or baby, for eg: diaper change, feeding, sleep etc. Sample baby activity skill uses DynamoDb to store and retrieve these health
   measurements.

   *Attributes:*
   1. userId - unique id identifying a user or a baby corresponding to the event.
   2. interfaceName - name of alexa health interface (Weight, InfantFeeding, Sleep, DiaperChange)
   3. timestamp - time associated with health measurement
   4. payload - healthMeasurement specific payload. For example, in case of DiaperChange, the payload might contain the type: Wet, mixed, dirty etc. For infant feeding, the payload might contain the nursing side.
   5. state - state of health measurement, can be one of CREATED, RUNNING, PAUSED depending on type of health measurement. RUNNING, PAUSED are used by timer health measurements such as sleep and infant feeding.

   In DynamoDB Table, a combination of (userId, interfaceName) is used as HashKey and timestamp is used as RangeKey. This allows sample skill to query the table based on time interval to satisfy get directive requests.

### Setup
   1. Clone the baby activity repository from [alexa-baby-activity-sample](https://github.com/alexa/alexa-baby-activity). Optionally, you can modify the repository name
   2. Deployment setup for skill lambda:
       1. Create 'HealthMeasurements' dynamodb table with HashKey(name: id, type:String) and RangeKey(name:timestamp, type:Number). Create IAM policies, LambdaExecutionRole with DDB full access to HealthMeasurements table and Lambda with new created lambda execution role. (Note: This step will be eventually be replaced by cloud formation template). <!--![CreateStack](images/cloudformation-launch-stack.png) with this [template](https://github.com/alexa/alexa-baby-activity/blob/master/template.json)-->
       2. Run following commands to clone baby-activity-skill repository to local dev environment and build the deployment package for lambda.
       ```
       cd <your workspace directory>
       git clone https://github.com/alexa/alexa-baby-activity.git
       cd alexa-baby-activity/sample_lambda/nodejs
       npm install --prefix=./
       zip -r alexa-baby-activity-sample.zip .
       ```
       3. Upload the zip file to lambda. Use sample_messages provided in this repository to create test events and test the lambda.

   3. In Alexa developer console, Update lambda endpoint in  new skill to the lambda that was created by cloud formation template.
   4. In your Alexa app, Log in with your developer credentials, go to Skills -> Dev skills section. You should see newly created sample baby activity skill. Enable the new skill and login with default test user credential(username: 'user', password: 'password'). The test user is associated with a baby with name 'Maggie'. After successful login, the baby profile(Maggie in this case) is sent to Alexa automatically.
   5. Start using Alexa to track Maggie's activity!. For eg, you can say
     * Alexa, log a wet diaper for Maggie.
     * Alexa, log a bottle feeding of six ounces.For more sample utterances see [baby-activity-skills](https://developer.amazon.com/docs/health/overview.html#utterances)

# License
This library is licensed under the [Amazon Software License 1.0](LICENSE).
