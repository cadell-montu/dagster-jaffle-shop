from dagster import Definitions
from dagster_dbt import DbtCliResource
from .assets import my_dbt_assets
from .project import jaffle_shop_project
from .schedules import schedules
from .jobs import jobs

defs = Definitions(
    assets=[my_dbt_assets],
    schedules=schedules,
    jobs=jobs,
    resources={
        "dbt": DbtCliResource(project_dir=jaffle_shop_project),
    },
)