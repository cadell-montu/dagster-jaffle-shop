from dagster import AssetExecutionContext, Config

from dagster_dbt import DbtCliResource, dbt_assets

from .project import jaffle_shop_project

class MyDbtConfig(Config):
    full_refresh: bool

@dbt_assets(manifest=jaffle_shop_project.manifest_path)
def my_dbt_assets(
        context: AssetExecutionContext, dbt: DbtCliResource, config: MyDbtConfig
):
    dbt_build_args = ["build"]
    if config.full_refresh:
        dbt_build_args += ["--full-refresh"]

    yield from dbt.cli(dbt_build_args, context=context).stream()
    