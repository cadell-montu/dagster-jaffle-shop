FROM python:3.10-slim

COPY requirements.txt .

RUN pip install -r requirements.txt

ENV DAGSTER_HOME=/opt/dagster/dagster_home/

RUN mkdir -p $DAGSTER_HOME

COPY dagster/workspace.yaml $DAGSTER_HOME
COPY dagster/dagster.docker.yaml $DAGSTER_HOME/dagster.yaml

WORKDIR $DAGSTER_HOME