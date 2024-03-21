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

import { Stack, StackProps, Environment, pipelines } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import { CodeCommitTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Construct } from 'constructs';
import { ComponentStage } from './component-resources-stack';
import { REPOSITORY_NAME, CDK_VERSION } from './configuration';



interface WorkloadPipelineProps extends StackProps {
  deploymentId: string,
  componentEnv: Environment,
  deploymentType: string,
}

export class WorkloadPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: WorkloadPipelineProps) {
    super(scope, id, props);

    const synthCdkParams =
    ' -c deployment_type='+props.deploymentType +
    ' -c deployment_id='+props.deploymentId +
    ' -c component_account='+props.componentEnv.account +
    ' -c component_region='+props.componentEnv.region;

    const codecommitInput = pipelines.CodePipelineSource.codeCommit(
      Repository.fromRepositoryName(this, 'repository', REPOSITORY_NAME),
      'main',
      { trigger: CodeCommitTrigger.NONE },
    );

    const synthStep = new pipelines.CodeBuildStep('synth', {
      input: codecommitInput,
      commands: [
        'npm install',
        'npx cdk synth -q --verbose' + synthCdkParams,
      ],
    });

    const pipelineName = props.deploymentType + '-' + props.deploymentId + '-pipeline';
    const pipeline = new pipelines.CodePipeline(this, pipelineName, {
      pipelineName: pipelineName,
      selfMutation: true,
      synth: synthStep,
      crossAccountKeys: true,
    });

    pipeline.addStage(new ComponentStage(this, props.deploymentId, {
      deploymentId: props.deploymentId,
      deploymentType: props.deploymentType,
      env: props.componentEnv, // defines where the resources will be provisioned
    }));

  }
}
