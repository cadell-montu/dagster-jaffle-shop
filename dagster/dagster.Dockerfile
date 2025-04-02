FROM python:3.10-slim

COPY dagster/requirements.txt .

RUN pip install -r requirements.txt

#RUN pip install \
#    dagster \
#    dagster-graphql \
#    dagster-webserver \
#    dagster-postgres \
#    dagster-docker

# Set $DAGSTER_HOME and copy dagster.yaml and workspace.yaml there
ENV DAGSTER_HOME=/opt/dagster/dagster_home/

RUN mkdir -p $DAGSTER_HOME

COPY dagster/workspace.yaml $DAGSTER_HOME
COPY dagster/dagster.docker.yaml $DAGSTER_HOME/dagster.yaml

WORKDIR $DAGSTER_HOME