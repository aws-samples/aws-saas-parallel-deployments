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

import { startPipelineExecution, waitPipelineExecution } from '../lib/apitools';
import { readConfig } from '../lib/configtools';
import { Deployment } from '../lib/types';

/*
 * update-deployments implements the control flow and logic of how updates are
 * rolled out to deployments. The default implementation uses a sequential
 * one-at-a-time strategy, with a configurable error bucket size.
 *
 * As each deployments' pipeline is implemented using CDK Pipelines, they can each
 * self-mutate. This means that we simply need to trigger the pipelines to execute,
 * and they will each update themselves. The utility waits for the pipeline
 * execution to finish, before continuing with the new pipeline.
 */

const allDeployments = readConfig('deployments.json') as Array<Deployment>;

const error_budget = 1;
let errors = 0;

console.log('Triggering each configured deployment to self-update.');
processDeployments(allDeployments).then(
  () => {
    console.log('Finished with '+errors+' error(s).');
  },
  (error: Error) => {
    console.error(error);
    process.exit(1);
  },
);

function incrementErrors() {
  if (++errors >= error_budget) {
    console.error('Error budget '+error_budget+' exhausted, aborting.');
    process.exit(1);
  }
}

async function processDeployments(deployments: Array<Deployment>) {
  for (const deployment of deployments) {
    if (!deployment.provisioned) {
      console.log('Ignoring unprovisioned deployment '+deployment.id);
      continue;
    }

    let pipelineName;
    console.log('Starting execution of ' + deployment.type + ' deployment pipeline ' + deployment.id);
    pipelineName = deployment.type + '-' + deployment.id + '-pipeline';

    let startResult;
    try {
      startResult = await startPipelineExecution(pipelineName);
    } catch (error) {
      console.error(error);
      incrementErrors();
      continue;
    }

    if (!startResult.pipelineExecutionId) {
      console.error('No executionId in startPipelineExecution response.');
      incrementErrors();
      continue;
    }

    console.log('Pipeline execution started with executionId '+startResult.pipelineExecutionId);

    let waitResult;
    try {
      waitResult = await waitPipelineExecution(pipelineName, startResult.pipelineExecutionId);
    } catch (error) {
      console.error(error);
      incrementErrors();
      continue;
    }
    if (waitResult != true) {
      incrementErrors();
    }
  }
}
