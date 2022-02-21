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

import { Stack, StackProps, Stage, StageProps} from 'aws-cdk-lib';
import { CfnService } from 'aws-cdk-lib/aws-apprunner';
import { Construct } from 'constructs';


interface DemoApprunnerStackProps extends StackProps {
  deploymentId: string,
  deploymentType: string,
}

export class DemoApprunnerStack extends Stack {
  constructor(scope: Construct, id: string, props: DemoApprunnerStackProps) {
    super(scope, id, props);

    new CfnService(this, 'app-runner', {
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

interface ComponentStageProps extends StageProps {
  deploymentId: string,
  deploymentType: string
}

export class ComponentStage extends Stage {
  constructor(scope: Construct, id: string, props: ComponentStageProps) {
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
