import { Construct } from 'constructs';
import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import { Repository, TagMutability } from 'aws-cdk-lib/aws-ecr';

export class EcrStack extends Stack {
  public readonly dagsterCore: Repository;
  public readonly dagsterRepository: Repository;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.dagsterCore = new Repository(this, 'DagsterCoreRepository', {
      repositoryName: 'dagster-core',
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.dagsterRepository = new Repository(this, 'DagsterRepositoryRepository', {
      repositoryName: 'dagster-repository',
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
