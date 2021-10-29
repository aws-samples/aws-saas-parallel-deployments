#!/usr/bin/env node

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

import { execSync } from 'child_process';
import { getRegions } from '../lib/apitools';
import { DeploymentRecord } from '../lib/types';
import { isValidDeploymentRecord } from '../lib/configtools';

/*
 * This utility is responsible for provisioning a new tenant pipeline. The utility
 * is executed in the AWS CodeBuild project 'provisioning-project'.
 *
 * The provisioning-project is automatically invoked whenever a new deployment
 * record is inserted into the deployment database (DynamoDB table). DynamoDB
 * Streams is configured with a AWS Lambda Trigger, which will pass the attributes
 * of the new record to this utility using environment variables.
 *
 * DEPLOYMENT_ID     = ID of the deployment
 * DEPLOYMENT_TYPE   = Type of deployment (silo or pool)
 * COMPONENT_ACCOUNT = AWS Account ID for component resources for this deployment
 * COMPONENT_REGION  = AWS Region, as above
 */

if (process.env.DEPLOYMENT_ID === undefined) {
  throw new Error('Missing required env variable DEPLOYMENT_ID');
}
if (process.env.DEPLOYMENT_TYPE === undefined) {
  throw new Error('missing required env variable DEPLOYMENT_TYPE');
}
if (process.env.COMPONENT_ACCOUNT === undefined) {
  throw new Error('Missing required env variable COMPONENT_ACCOUNT');
}
if (process.env.COMPONENT_REGION === undefined) {
  throw new Error('Missing required env variable COMPONENT_REGION');
}

const newRecord: DeploymentRecord = {
  id: process.env.DEPLOYMENT_ID,
  type: process.env.DEPLOYMENT_TYPE,
  account: process.env.COMPONENT_ACCOUNT,
  region: process.env.COMPONENT_REGION,
};

console.log('New deployment record:');
console.log(newRecord);

// Validate the record, and provision new tenant if validation passes
processRecord(newRecord).catch(error => {
  console.error(error);
  process.exit(1);
});

async function processRecord(record: DeploymentRecord): Promise<void> {
  const regions = await getRegions();
  if (isValidDeploymentRecord(record, regions)) {
    console.log('Provisioning new deployment ' + record.id);
    await provisionPipelineStack(record);
  }
}

// Provision new silo or pool deployment. We will call CDK deploy with specific runtime context values.
async function provisionPipelineStack(record: DeploymentRecord): Promise<void> {
  const stackName = `${record.type}-${record.id}-pipeline`;
  const command =
    `npx cdk deploy ${stackName} --require-approval never` +
    ` -c deployment_type=${record.type}` +
    ` -c deployment_id=${record.id}` +
    ` -c component_account=${record.account}` +
    ` -c component_region=${record.region}`;

  console.log('Executing: ' + command);
  execSync(command, { stdio: 'inherit' });
}