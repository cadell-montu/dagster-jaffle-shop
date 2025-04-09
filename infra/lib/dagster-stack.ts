import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  InstanceClass,
  InstanceSize,
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import {
  AppProtocol,
  AwsLogDriverMode,
  Cluster,
  ContainerImage,
  FargateService,
  FargateTaskDefinition,
  LogDrivers,
  Protocol,
  Secret,
} from 'aws-cdk-lib/aws-ecs';
import { EcrStack } from './ecr-stack';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine } from 'aws-cdk-lib/aws-rds';
import { NamespaceType } from 'aws-cdk-lib/aws-servicediscovery';
import { ApplicationLoadBalancedFargateService } from 'aws-cdk-lib/aws-ecs-patterns';
import { ApplicationProtocol } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

// import { MontuSharedVpc } from '@montugroup/infra';

export type DagsterStackProps = {
  ecrStack: EcrStack;
};

export class DagsterStack extends Stack {
  constructor(scope: Construct, id: string, props: DagsterStackProps) {
    super(scope, id);

    const { ecrStack } = props;

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
      instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MICRO),
      instanceIdentifier: 'dagster',
      vpc,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [databaseSecurityGroup],
      databaseName: 'dagster',
      credentials: Credentials.fromGeneratedSecret('dagster'),
      allocatedStorage: 20,
      storageEncrypted: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const dagsterSecrets = {
      DAGSTER_POSTGRES_USER: Secret.fromSecretsManager(database.secret!, 'username'),
      DAGSTER_POSTGRES_PASSWORD: Secret.fromSecretsManager(database.secret!, 'password'),
      DAGSTER_POSTGRES_HOST: Secret.fromSecretsManager(database.secret!, 'host'),
      DAGSTER_POSTGRES_DB: Secret.fromSecretsManager(database.secret!, 'dbname'),
      DAGSTER_POSTGRES_PORT: Secret.fromSecretsManager(database.secret!, 'port'),
    };

    const cluster = new Cluster(this, 'DagsterCluster', {
      clusterName: 'dagster-cluster',
      vpc,
    });
    const namespace = cluster.addDefaultCloudMapNamespace({
      name: 'dagster.private',
      useForServiceConnect: true,
      type: NamespaceType.DNS_PRIVATE,
      vpc,
    });
    // const { repository } = ecrStack;

    const webserverTaskDefinition = new FargateTaskDefinition(
      this,
      'DagsterWebserverTaskDefinition',
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
      },
    );

    ecrStack.dagsterCore.grantPull(webserverTaskDefinition.obtainExecutionRole());

    const dagsterImage = ContainerImage.fromEcrRepository(ecrStack.dagsterCore, `latest`);

    webserverTaskDefinition
      .addContainer('DagsterWebserver', {
        image: dagsterImage,
        entryPoint: ['dagster-webserver', '-h', '0.0.0.0', '-p', '80', '-w', 'workspace.yaml'],
        logging: LogDrivers.awsLogs({
          streamPrefix: 'dagster-webserver',
          mode: AwsLogDriverMode.NON_BLOCKING,
          logGroup: new LogGroup(this, 'DagsterWebserverLogGroup', {
            logGroupName: 'dagster-webserver',
            retention: RetentionDays.TWO_WEEKS,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        }),
        environment: {},
        secrets: {
          ...dagsterSecrets,
        },
      })
      .addPortMappings({
        containerPort: 80,
        protocol: Protocol.TCP,
      });

    const dagsterWebserverSecurityGroup = new SecurityGroup(this, 'DagsterWebserverSecurityGroup', {
      vpc,
      description: 'Dagster Webserver',
      allowAllOutbound: true,
    });
    databaseSecurityGroup.addIngressRule(dagsterWebserverSecurityGroup, Port.POSTGRES);

    const albWebserverService = new ApplicationLoadBalancedFargateService(
      this,
      'DagsterWebserverAlbFargateService',
      {
        cluster,
        taskDefinition: webserverTaskDefinition,
        securityGroups: [dagsterWebserverSecurityGroup],
        loadBalancerName: 'dagster-webserver',
        serviceName: 'webserver',
        desiredCount: 1,
        minHealthyPercent: 0,
        circuitBreaker: {
          enable: true,
          rollback: true,
        },
        publicLoadBalancer: true,
        protocol: ApplicationProtocol.HTTP,
        openListener: false,
        // redirectHTTP: true,
        // protocol: ApplicationProtocol.HTTPS,
        // sslPolicy: SslPolicy.RECOMMENDED_TLS,
        taskSubnets: {
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
      },
    );
    albWebserverService.service.enableServiceConnect({
      namespace: namespace.namespaceArn,
    });

    const albSecurityGroup = new SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    // Netskope
    const netskopeIpsString =
      '163.116.211.0/24,163.116.192.0/24,163.116.203.0/24,163.116.198.0/24,163.116.206.0/24,163.116.215.0/24,163.116.202.0/24';
    const netskopeIps = netskopeIpsString.split(',');
    const ipRestrictions = [...netskopeIps, '159.196.132.38/32']; // Cadell's House
    ipRestrictions.forEach((ipAddress, index) => {
      albSecurityGroup.addIngressRule(Peer.ipv4(ipAddress), Port.HTTP, `Netskope ${index + 1}`);
    });

    albWebserverService.loadBalancer.addSecurityGroup(albSecurityGroup);

    const daemonTaskDefinition = new FargateTaskDefinition(this, 'DagsterDaemonTaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 2048,
    });

    ecrStack.dagsterCore.grantPull(daemonTaskDefinition.obtainExecutionRole());
    ecrStack.dagsterRepository.grantPull(daemonTaskDefinition.obtainExecutionRole());

    daemonTaskDefinition.addContainer('DagsterDaemon', {
      image: dagsterImage,
      entryPoint: ['dagster-daemon', 'run'],
      logging: LogDrivers.awsLogs({
        streamPrefix: 'dagster-daemon',
        mode: AwsLogDriverMode.NON_BLOCKING,
        logGroup: new LogGroup(this, 'DagsterDaemonLogGroup', {
          logGroupName: 'dagster-daemon',
          retention: RetentionDays.TWO_WEEKS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      }),
      secrets: {
        ...dagsterSecrets,
      },
    });

    // const { account, region } = this;

    daemonTaskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        sid: 'DagsterDaemon',
        effect: Effect.ALLOW,
        actions: [
          'ec2:DescribeNetworkInterfaces',
          'ecs:DescribeTaskDefinition',
          'ecs:DescribeTasks',
          'ecs:ListAccountSettings',
          'ecs:RegisterTaskDefinition',
          'ecs:RunTask',
          'ecs:TagResource',
          'secretsmanager:DescribeSecret',
          'secretsmanager:ListSecrets',
          'secretsmanager:GetSecretValue',
        ],
        resources: [`*`], // @todo(cc): lock this down
      }),
    );
    daemonTaskDefinition.addToTaskRolePolicy(
      new PolicyStatement({
        sid: 'DagsterDaemonPassRole',
        effect: Effect.ALLOW,
        actions: ['iam:PassRole'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'iam:PassedToService': 'ecs-tasks.amazonaws.com',
          },
        },
      }),
    );

    const dagsterDaemonSecurityGroup = new SecurityGroup(this, 'DagsterSecurityGroup', {
      vpc,
      description: 'Dagster Daemon',
      allowAllOutbound: true,
    });
    databaseSecurityGroup.addIngressRule(dagsterDaemonSecurityGroup, Port.POSTGRES);

    new FargateService(this, 'DagsterDaemonFargateService', {
      cluster,
      taskDefinition: daemonTaskDefinition,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dagsterDaemonSecurityGroup],
      serviceName: 'daemon',
      desiredCount: 1,
      minHealthyPercent: 0,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
    });

    const repositoryTaskDefinition = new FargateTaskDefinition(
      this,
      'DagsterRepositoryTaskDefinition',
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
      },
    );

    ecrStack.dagsterRepository.grantPull(repositoryTaskDefinition.obtainExecutionRole());

    const repositoryImage = ContainerImage.fromEcrRepository(ecrStack.dagsterRepository, `latest`);

    const repositoryServiceName = 'repository';
    const repositoryPort = 4000;

    repositoryTaskDefinition
      .addContainer('DagsterRepository', {
        image: repositoryImage,
        logging: LogDrivers.awsLogs({
          streamPrefix: 'dagster-repository',
          mode: AwsLogDriverMode.NON_BLOCKING,
          logGroup: new LogGroup(this, 'DagsterRepositoryLogGroup', {
            logGroupName: 'dagster-repository',
            retention: RetentionDays.TWO_WEEKS,
            removalPolicy: RemovalPolicy.DESTROY,
          }),
        }),
        environment: {
          DAGSTER_CURRENT_IMAGE: ecrStack.dagsterRepository.repositoryUriForTag('latest'),
        },
        secrets: {
          ...dagsterSecrets,
        },
      })
      .addPortMappings({
        name: repositoryServiceName,
        containerPort: repositoryPort,
        appProtocol: AppProtocol.grpc,
        protocol: Protocol.TCP,
      });

    const dagsterRepositorySecurityGroup = new SecurityGroup(
      this,
      'DagsterRepositorySecurityGroup',
      {
        vpc,
        description: 'Dagster Repository',
        allowAllOutbound: true,
      },
    );
    dagsterRepositorySecurityGroup.addIngressRule(
      Peer.anyIpv4(), // @todo(cc): we could lock this down
      Port.tcp(repositoryPort),
      'repository inbound',
      false,
    );
    databaseSecurityGroup.addIngressRule(dagsterRepositorySecurityGroup, Port.POSTGRES);

    new FargateService(this, 'DagsterRepositoryFargateService', {
      cluster,
      taskDefinition: repositoryTaskDefinition,
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [dagsterRepositorySecurityGroup],
      serviceName: repositoryServiceName,
      desiredCount: 1,
      minHealthyPercent: 0,
      circuitBreaker: {
        enable: true,
        rollback: true,
      },
      serviceConnectConfiguration: {
        namespace: namespace.namespaceArn,
        services: [
          {
            portMappingName: repositoryServiceName,
            dnsName: repositoryServiceName,
            port: repositoryPort,
            perRequestTimeout: Duration.seconds(10),
          },
        ],
      },
    });
  }
}
