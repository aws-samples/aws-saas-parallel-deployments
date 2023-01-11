/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION });

var codebuild = new AWS.CodeBuild({apiVersion: '2016-10-06'});

const projectName = process.env.PROJECT_NAME;

async function startBuildCommand(image) {
  // For production use, implementing error handling for
  // the CodeBuild API calls is recommended. Transient errors, such as
  // reaching maximum number of allowed concurrent CodeBuild executions
  // may cause errors that require a retry.

  const env = [
    { name: 'DEPLOYMENT_ID', value: image.id.S },
  ];

  if ('type' in image) {
    env.push({ name: 'DEPLOYMENT_TYPE', value: image.type.S });
  }
  if ('account' in image) {
    env.push({ name: 'COMPONENT_ACCOUNT', value: image.account.S });
  }
  if ('region' in image) {
    env.push({ name: 'COMPONENT_REGION', value: image.region.S });
  }

  const params = {
    projectName: projectName,
    environmentVariablesOverride: env,
  };

  console.log('Calling startBuild() on CodeBuild project ' + projectName);
  try {
    const result = await codebuild.startBuild(params).promise();
    console.log(result);
  } catch (error) {
    console.error(error);
  }
}

exports.handler = async function (event) {

  // Process DynamoDB Streams event records
  for (const record of event.Records) {
    // For all INSERT records, we provision a new deployment

    if (record.eventName == 'INSERT') {
      console.log('New item added to deployment database');
      console.log(record.dynamodb);

      await startBuildCommand(record.dynamodb.NewImage);
    }

    // This sample code does not process MODIFY or DELETE records
    // Implementation of business logic related to these events is
    // left for the reader.

    if (record.eventName == 'MODIFY') {
      // TODO
    }

    if (record.eventName == 'DELETE') {
      // TODO
    }

  }

};
