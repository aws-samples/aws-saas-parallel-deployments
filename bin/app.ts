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

import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ToolchainStack } from '../lib/toolchain-stack';
import { WorkloadPipelineStack } from '../lib/workload-pipeline-stack';
import { TOOLCHAIN_ENV } from '../lib/configuration';

const app = new cdk.App();

/*
 * This is the main CDK application for the sample solution.
 *
 * This CDK application has two modes of operation, and will synthesize a different
 * stack depending on the mode.
 *
 * Mode A: Synthesize the toolchain stack. This is the default mode.
 *         This is used during the initial deployment of the solution, and by
 *         the 'cicd-pipeline' for synthesizing the stack during updates.
 *         No additional arguments are used.
 *
 * Mode B: In this mode, the application synthesizes a silo or pool pipeline stack.
 *         To operate in this mode, cdk is called with the following context
 *         variables (-c in the cli)
 *
 *         deployment_type  : the type of deployment stack to create (silo|pool)
 *         deployment_id    : the deployment id (siloid|poolid)
 *         component_account: the AWS Account where the component resources for
 *                          : this deployment are deployed to
 *         component_region : the AWS Region, as above
 */


const deploymentType = app.node.tryGetContext('deployment_type');
const deploymentId = app.node.tryGetContext('deployment_id');
const componentAccount = app.node.tryGetContext('component_account');
const componentRegion = app.node.tryGetContext('component_region');


if (!deploymentType) {
  // Mode A: synthesize the main toolchain stack
  new ToolchainStack(app, 'toolchain', {
    env: TOOLCHAIN_ENV,
  });
} else {
  // Mode B: Synthetize workload pipeline
  const stackName = deploymentType + '-' + deploymentId + '-pipeline';
  console.log('Synthesizing stack for ' + stackName);
  console.log('deployment_id: ' + deploymentId);
  console.log('component_account: ' + componentAccount);
  console.log('component_region: ' + componentRegion);

  new WorkloadPipelineStack(app, stackName, {
    stackName,
    deploymentId,
    deploymentType,
    env: TOOLCHAIN_ENV,
    componentEnv: {
      region: componentRegion,
      account: componentAccount,
    },
  });

}
