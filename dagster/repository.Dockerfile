FROM python:3.10-slim

COPY requirements.txt .

RUN pip install -r requirements.txt

WORKDIR /opt/dagster/app
COPY . .

WORKDIR dbt
RUN dbt compile
RUN dbt seed

WORKDIR /opt/dagster/app

EXPOSE 4000

CMD ["dagster", "api", "grpc", "-h", "0.0.0.0", "-p", "4000", "-d", "dagster", "-m", "jaffle_dagster.definitions"]