import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriverMode,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
} from 'aws-cdk-lib/aws-ecs';
import { EcrStack } from './ecr-stack';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';

// import { MontuSharedVpc } from '@montugroup/infra';

export type DagsterStackProps = {
  ecrStack: EcrStack;
};

export class DagsterStack extends Stack {
  constructor(scope: Construct, id: string, props?: DagsterStackProps) {
    super(scope, id);

    // const { ecrStack } = props;

    // const montuSharedVpc = new MontuSharedVpc(this);

    const vpc = new Vpc(this, 'DagsterVpc', {
      natGateways: 1,
      subnetConfiguration: [
        {
          name: 'dagster-public-subnet',
          subnetType: SubnetType.PUBLIC,
        },
        {
          name: 'dagster-private-subnet',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const cluster = new Cluster(this, 'DagsterCluster', {
      vpc,
      clusterName: 'dagster-cluster',
    });

    const taskDefinition = new FargateTaskDefinition(this, 'DagsterTaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    // const { repository } = ecrStack;

    // repository.grantPull(taskDefinition.obtainExecutionRole());

    const image: ContainerImage = ContainerImage.fromDockerImageAsset(
      new DockerImageAsset(this, 'dagster-image-asset', {
        directory: path.join(process.cwd(), '..'),
        file: 'dagster/dagster.Dockerfile',
        platform: Platform.LINUX_AMD64,
      }),
    );
    // ContainerImage.fromEcrRepository(repository, `sha-${123456}`);

    taskDefinition.addContainer('DagsterContainerImage', {
      image,
      entryPoint: ['dagster-webserver', '-h', '0.0.0.0', '-p', '3000', '-w', 'workspace.yaml'],
      logging: LogDrivers.awsLogs({
        streamPrefix: 'dagster',
        mode: AwsLogDriverMode.NON_BLOCKING,
        logGroup: new LogGroup(this, 'DagsterLogGroup', {
          logGroupName: 'dagster',
          retention: RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      }),
      environment: {},
    });

    new FargateService(this, 'DagsterFargateService', {
      cluster,
      taskDefinition,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      serviceName: 'dagster-service',
      desiredCount: 1,
      minHealthyPercent: 0,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
    });
  }
}
