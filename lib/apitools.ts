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

import { DynamoDBClient, paginateQuery, paginateScan, QueryCommandInput, ScanCommandInput } from '@aws-sdk/client-dynamodb';
import { CloudFormationClient, paginateListStacks, StackSummary, ListStacksCommandInput } from '@aws-sdk/client-cloudformation';
import { CodePipelineClient, StartPipelineExecutionCommand, StartPipelineExecutionCommandInput, StartPipelineExecutionCommandOutput, GetPipelineExecutionCommand, GetPipelineExecutionCommandInput, GetPipelineStateCommand, GetPipelineStateCommandInput } from '@aws-sdk/client-codepipeline';
import { EC2Client, DescribeRegionsCommand, DescribeRegionsCommandInput } from '@aws-sdk/client-ec2';
import { DEPLOYMENT_TABLE_NAME } from '../lib/configuration';
import { DeploymentRecord } from '../lib/types';

if (!('AWS_REGION' in process.env)) {
  throw new Error('AWS_REGION is not specified. Please set AWS_REGION to the target deployment pipeline region.');
}

export async function scanDynamoDB(): Promise<Array<DeploymentRecord>> {
  const client = new DynamoDBClient({ region: process.env.AWS_REGION });

  const records: Array<DeploymentRecord> = [];
  const params: ScanCommandInput = {
    TableName: DEPLOYMENT_TABLE_NAME,
  };

  const paginator = paginateScan({ client: client }, params);
  for await (const page of paginator) {
    page.Items?.forEach(item => {
      const record: DeploymentRecord = {
        id: item.id.S as string,
        type: item.type.S as string,
        account: item.account.S as string,
        region: item.region.S as string,
      };
      records.push(record);
    });
  }

  return records;
}

export async function getCloudFormationStacks(): Promise<Array<string>> {
  const client = new CloudFormationClient({ region: process.env.AWS_REGION });

  const stacks: Array<string> = [];
  const params: ListStacksCommandInput = {
    StackStatusFilter: [
      'CREATE_COMPLETE',
      'ROLLBACK_COMPLETE',
      'UPDATE_COMPLETE',
      'UPDATE_ROLLBACK_COMPLETE',
    ],
  };

  const paginator = paginateListStacks({ client: client }, params);
  for await (const page of paginator) {
    page.StackSummaries?.forEach((stack: StackSummary) => {
      stacks.push(stack.StackName || '');
    });
  }

  return stacks;
}

export async function startPipelineExecution(pipeline: string): Promise<StartPipelineExecutionCommandOutput> {
  const client = new CodePipelineClient({ region: process.env.AWS_REGION });
  const input: StartPipelineExecutionCommandInput = { name: pipeline };
  const command = new StartPipelineExecutionCommand(input);

  const result = await client.send(command);
  return result;
}

export async function waitPipelineExecution(pipeline: string, executionId: string, maxWaitSeconds: number = 30*60): Promise<boolean> {
  const client = new CodePipelineClient({ region: process.env.AWS_REGION });
  const input: GetPipelineExecutionCommandInput = {
    pipelineName: pipeline,
    pipelineExecutionId: executionId,
  };

  console.log('Waiting for pipeline execution to complete.');
  const startTime = Date.now();
  for (;;) {

    // We wait in 20s intervals by default for the pipeline to finish
    // First verify that we haven't waited too long
    if ((Date.now() - startTime) > maxWaitSeconds*1000) {
      console.error('Maximum wait time of 30 minutes exceeded. Aborting.');
      return false;
    }
    await new Promise(r => setTimeout(r, 20000));

    const command = new GetPipelineExecutionCommand(input);
    const response = await client.send(command);

    const status = response.pipelineExecution?.status || 'undefined';

    if (status === 'Succeeded') {
      console.log('Pipeline execution has finished.');
      return true;
    } else if (status === 'InProgress') {
      console.log('Execution in progress, waiting..');
    } else if (status === 'Cancelled' || status === 'Superseded') {
      /*
       * CDK Pipeline self-mutate will cancel the original
       * execution, and start a new one. If this happens, we need
       * to lookup the latest execution ID, and wait for it instead.
       *
       * A Superseded status indicates that our execution has been
       * stopped in favor of a more recent one. This should not happen
       * unless you trigger pipeline executions outside of this solution.
       * If it does happen, we can treat it as we do the Cancelled status.
       */
      console.log('Execution was '+status+', looking up new latest executionId');
      const newExecutionId = await getLatestPipelineExecutionId(pipeline);
      if (newExecutionId === undefined) {
        console.error('Could not determine latest pipeline executionId');
        return false;
      } else {
        console.log('Latest executionId is ' + newExecutionId);
        input.pipelineExecutionId = newExecutionId;
        continue;
      }
    } else {
      // All other status codes (Stopped, Stopping, Failed) indicate a failure
      console.error('Pipeline status is ' + status + ', aborting.');
      return false;
    }
  }
}

// Get the latest pipeline execution ID. Execution ID will change in self-mutate stage.
export async function getLatestPipelineExecutionId(pipeline: string): Promise<string | undefined> {
  const client = new CodePipelineClient({ region: process.env.AWS_REGION });
  const input: GetPipelineStateCommandInput = { name: pipeline };
  const command = new GetPipelineStateCommand(input);

  const response = await client.send(command);

  if (response.stageStates) {
    const sourceIndex = response.stageStates.findIndex(s => s.stageName === 'Source');
    if (sourceIndex >= 0) {
      const sourceStage = response.stageStates[sourceIndex];
      return sourceStage.latestExecution?.pipelineExecutionId;
    }
  }
  return undefined;
}

// Get all AWS regions
export async function getRegions(): Promise<Array<string>> {
  const client = new EC2Client({ region: process.env.AWS_REGION });
  const input: DescribeRegionsCommandInput = {};
  const command = new DescribeRegionsCommand(input);
  const regions: Array<string> = [];

  const output = await client.send(command);

  if (output.Regions) {
    output.Regions.forEach(region => {
      regions.push(region.RegionName as string);
    });
  } else {
    throw new Error("No regions returned by query");
  }
  return regions;
}
