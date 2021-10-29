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
import * as apprunner from '@aws-cdk/aws-apprunner';


interface DemoApprunnerStackProps extends cdk.StackProps {
  deploymentId: string,
  deploymentType: string,
}

export class DemoApprunnerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: DemoApprunnerStackProps) {
    super(scope, id, props);

    new apprunner.CfnService(this, 'app-runner', {
      sourceConfiguration: {
        imageRepository: {
          imageIdentifier: 'public.ecr.aws/aws-containers/hello-app-runner:latest',
          imageRepositoryType: 'ECR_PUBLIC',
        },
      },
      serviceName: props.deploymentType + '-' + props.deploymentId + '-solution',
    });

  }
}

interface ComponentStageProps extends cdk.StageProps {
  deploymentId: string,
  deploymentType: string
}

export class ComponentStage extends cdk.Stage {
  constructor(scope: cdk.Construct, id: string, props: ComponentStageProps) {
    super(scope, id, props);

    // The starting point of your component resource stack(s)
    // props.deploymentId contains the deployment id
    // props.deploymentType contains the deployment type (silo or pool)

    new DemoApprunnerStack(this, props.deploymentId, {
      stackName: props.deploymentType + '-' + props.deploymentId + '-resources',
      deploymentId: props.deploymentId,
      deploymentType: props.deploymentType,
    });

    // Additional stacks can be defined here, in case your
    // component is composed out of more than one stack
  }
}
