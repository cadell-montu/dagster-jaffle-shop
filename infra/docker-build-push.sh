docker build .. -f ../dagster/dagster.Dockerfile -t dagster-core --platform linux/amd64 --build-arg DAGSTER_YAML=dagster.ecs.yaml

docker build .. -f ../dagster/repository.Dockerfile -t dagster-repository --platform linux/amd64

export REGISTRY_URL=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REGISTRY_URL

docker tag dagster-core $REGISTRY_URL/dagster-core:latest
docker push $REGISTRY_URL/dagster-core:latest

docker tag dagster-repository $REGISTRY_URL/dagster-repository:latest
docker push $REGISTRY_URL/dagster-repository:latest