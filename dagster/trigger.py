from dagster_graphql import DagsterGraphQLClient

client = DagsterGraphQLClient("localhost", port_number=3000)

client.submit_job_execution(
    "all_dbt_assets"
)