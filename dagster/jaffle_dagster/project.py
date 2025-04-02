from pathlib import Path

from dagster_dbt import DbtProject

jaffle_shop_project = DbtProject(
    project_dir=Path(__file__).joinpath("..", "..", "..", "dbt").resolve(),
    packaged_project_dir=Path(__file__).joinpath("..", "..", "dbt", "dbt-project").resolve(),
)
jaffle_shop_project.prepare_if_dev()