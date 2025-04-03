import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriverMode,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  Secret,
} from 'aws-cdk-lib/aws-ecs';
import { EcrStack } from './ecr-stack';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import {
  Credentials,
  DatabaseInstance,
  DatabaseInstanceEngine,
  DatabaseSecret,
} from 'aws-cdk-lib/aws-rds';

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
        {
          name: 'dagster-isolated-subnet',
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const databaseSecurityGroup = new SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Dagster Database',
      allowAllOutbound: true,
      disableInlineRules: true,
    });

    const database = new DatabaseInstance(this, 'DagsterDatabase', {
      engine: DatabaseInstanceEngine.POSTGRES,
      databaseName: 'dagster',
      instanceIdentifier: 'dagster',
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      allocatedStorage: 20,
      credentials: Credentials.fromGeneratedSecret('dagster'),
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [databaseSecurityGroup],
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
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

    const dagsterSecrets = {
      DAGSTER_POSTGRES_USER: Secret.fromSecretsManager(database.secret!, 'username'),
      DAGSTER_POSTGRES_PASSWORD: Secret.fromSecretsManager(database.secret!, 'password'),
      DAGSTER_POSTGRES_HOST: Secret.fromSecretsManager(database.secret!, 'host'),
      DAGSTER_POSTGRES_DB: Secret.fromSecretsManager(database.secret!, 'dbname'),
      DAGSTER_POSTGRES_PORT: Secret.fromSecretsManager(database.secret!, 'port'),
    };

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
      secrets: {
        ...dagsterSecrets,
      },
    });

    const dagsterSecurityGroup = new SecurityGroup(this, 'DagsterSecurityGroup', {
      vpc,
      description: 'Dagster',
      allowAllOutbound: true,
    });
    databaseSecurityGroup.addIngressRule(dagsterSecurityGroup, Port.POSTGRES);

    new FargateService(this, 'DagsterFargateService', {
      cluster,
      taskDefinition,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dagsterSecurityGroup],
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
