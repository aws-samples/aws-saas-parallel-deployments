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

import { Stack, StackProps, RemovalPolicy, aws_codecommit, aws_dynamodb, pipelines, aws_iam, aws_codebuild, DefaultStackSynthesizer, aws_lambda } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { DEPLOYMENT_TABLE_NAME, REPOSITORY_NAME, CDK_VERSION } from './configuration';


export class ToolchainStack extends Stack {

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const deploymentTable = new aws_dynamodb.Table(this, 'deployment-table', {
      tableName: DEPLOYMENT_TABLE_NAME,
      partitionKey: {
        name: 'id',
        type: aws_dynamodb.AttributeType.STRING,
      },
      stream: aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      billingMode: aws_dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Importing pre-created CodeCommit repository by name.
    const sourceRepository = aws_codecommit.Repository.fromRepositoryName(this, 'repository', REPOSITORY_NAME);

    const synthStep = new pipelines.CodeBuildStep('synth', {
      input: pipelines.CodePipelineSource.codeCommit(sourceRepository, 'main'),
      commands: [
        'npm ci',
        'npx cdk synth -q --verbose',
      ],
    });

    const pipeline = new pipelines.CodePipeline(this, 'cicd-pipeline', {
      pipelineName: 'CICD-Pipeline',
      selfMutation: true,
      synth: synthStep,
      cliVersion: CDK_VERSION,
    });

    const updateDeploymentsRole = new aws_iam.Role(this, 'update-deployments-role', {
      assumedBy: new aws_iam.ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        'deployment-policy': new aws_iam.PolicyDocument({
          statements: [
            new aws_iam.PolicyStatement({
              actions: [
                'codepipeline:StartPipelineExecution',
                'codepipeline:GetPipelineExecution',
                'codepipeline:GetPipelineState',
              ],
              resources: [
                'arn:aws:codepipeline:' + this.region + ':' + this.account + ':silo-*-pipeline',
                'arn:aws:codepipeline:' + this.region + ':' + this.account + ':pool-*-pipeline',
              ],
              effect: aws_iam.Effect.ALLOW,
            }),
            new aws_iam.PolicyStatement({
              actions: ['cloudformation:ListStacks'],
              effect: aws_iam.Effect.ALLOW,
              resources: ['*'],
            }),
            new aws_iam.PolicyStatement({
              actions: ['dynamodb:Query', 'dynamodb:Scan'],
              effect: aws_iam.Effect.ALLOW,
              resources: [deploymentTable.tableArn, deploymentTable.tableArn + '/index/*'],
            }),
            new aws_iam.PolicyStatement({
              actions: ['ec2:DescribeRegions'],
              effect: aws_iam.Effect.ALLOW,
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    pipeline.addWave('UpdateDeployments', {
      post: [
        new pipelines.CodeBuildStep('update-deployments', {
          commands: [
            'npm ci',
            'npx ts-node bin/get-deployments.ts',
            'npx ts-node bin/update-deployments.ts',
          ],
          buildEnvironment: {
            buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
          },
          role: updateDeploymentsRole,
        }),
      ],
    });


    // CodeBuild Project for Provisioning Build Job
    const project = new aws_codebuild.Project(this, 'provisioning-project', {
      projectName: 'provisioning-project',
      source: aws_codebuild.Source.codeCommit({
        repository: sourceRepository,
        branchOrRef: 'refs/heads/main',
      }),
      environment: {
        buildImage: aws_codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      buildSpec: aws_codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'npm ci',
              'npx ts-node bin/provision-deployment.ts',
            ],
          },
        },
      }),
    });

    // Allow provision project to use CDK bootstrap roles. These are required when provision project runs CDK deploy
    project.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [
        'arn:aws:iam::' + this.account + ':role/cdk-' + DefaultStackSynthesizer.DEFAULT_QUALIFIER + '-deploy-role-' + this.account + '-' + this.region,
        'arn:aws:iam::' + this.account + ':role/cdk-' + DefaultStackSynthesizer.DEFAULT_QUALIFIER + '-file-publishing-role-' + this.account + '-' + this.region,
        'arn:aws:iam::' + this.account + ':role/cdk-' + DefaultStackSynthesizer.DEFAULT_QUALIFIER + '-image-publishing-role-' + this.account + '-' + this.region,
      ],
      effect: aws_iam.Effect.ALLOW,
    }));

    // Allow provision project to get AWS regions.
    // This is required for deployment information validation.
    project.addToRolePolicy(new aws_iam.PolicyStatement({
      actions: ['ec2:DescribeRegions'],
      effect: aws_iam.Effect.ALLOW,
      resources: ['*'],
    }));

    // Lambda Function for DynamoDB Streams
    const streamLambda = new aws_lambda.Function(this, 'stream-lambda', {
      runtime: aws_lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      code: aws_lambda.Code.fromAsset(path.join(__dirname, 'lambdas/stream-lambda')),
      environment: {
        PROJECT_NAME: 'provisioning-project',
      },
    });

    streamLambda.role?.attachInlinePolicy(new aws_iam.Policy(this, 'start-pipeline-policy', {
      document: new aws_iam.PolicyDocument({
        statements: [
          new aws_iam.PolicyStatement({
            effect: aws_iam.Effect.ALLOW,
            resources: [project.projectArn],
            actions: ['codebuild:StartBuild'],
          }),
        ],
      }),
    }));

    streamLambda.addEventSource(new DynamoEventSource(deploymentTable, {
      startingPosition: aws_lambda.StartingPosition.LATEST,
    }));
  }
}
