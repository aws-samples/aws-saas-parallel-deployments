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

import * as cdk from '@aws-cdk/core';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as pipelines from '@aws-cdk/pipelines';
import * as codecommit from '@aws-cdk/aws-codecommit';
import { ComponentStage } from './component-resources-stack';
import { REPOSITORY_NAME, CDK_VERSION } from './configuration';


interface WorkloadPipelineProps extends cdk.StackProps {
  deploymentId: string,
  componentEnv: cdk.Environment,
  deploymentType: string,
}

export class WorkloadPipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: WorkloadPipelineProps) {
    super(scope, id, props);

    const synthCdkParams =
    ' -c deployment_type='+props.deploymentType +
    ' -c deployment_id='+props.deploymentId +
    ' -c component_account='+props.componentEnv.account +
    ' -c component_region='+props.componentEnv.region;

    const codecommitInput = pipelines.CodePipelineSource.codeCommit(
      codecommit.Repository.fromRepositoryName(this, 'repository', REPOSITORY_NAME),
      'main',
      { trigger: codepipeline_actions.CodeCommitTrigger.NONE },
    );

    const synthStep = new pipelines.CodeBuildStep('synth', {
      input: codecommitInput,
      commands: [
        'npm ci',
        'npx cdk synth -q --verbose' + synthCdkParams,
      ],
    });

    const pipelineName = props.deploymentType + '-' + props.deploymentId + '-pipeline';
    const pipeline = new pipelines.CodePipeline(this, pipelineName, {
      pipelineName: pipelineName,
      selfMutation: true,
      synth: synthStep,
      crossAccountKeys: true,
      cliVersion: CDK_VERSION,
    });

    pipeline.addStage(new ComponentStage(this, props.deploymentId, {
      deploymentId: props.deploymentId,
      deploymentType: props.deploymentType,
      env: props.componentEnv, // defines where the resources will be provisioned
    }));

  }
}
