import { Construct } from 'constructs';
import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import { Repository, TagMutability } from 'aws-cdk-lib/aws-ecr';

export class EcrStack extends Stack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.repository = new Repository(this, 'DagsterRepository', {
      repositoryName: 'dagster',
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
