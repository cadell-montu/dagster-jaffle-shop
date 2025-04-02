from dagster import RunConfig, define_asset_job
from dagster_dbt import build_dbt_asset_selection
from .assets import my_dbt_assets, MyDbtConfig

jobs = [
    define_asset_job(
        name="all_dbt_assets",
        selection=build_dbt_asset_selection(
            [my_dbt_assets],
        ),
        config=RunConfig(
            ops={"my_dbt_assets": MyDbtConfig(full_refresh=True, seed=True)}
        ),
    )
]