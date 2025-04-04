# The Jaffle Shop

featuring DBT and Dagster.

![Screenshot](screenshot.png)

## Overview
```
cd dbt
dbt build
```

```
cd dagster
dagster dev
```

## Getting Started
1. Setup venv.
   ```
   python -m venv venv
   ```
2. Use venv.
   ```
   source venv/bin/activate
   ```
3. Install dependencies.
   ```
   pip install -r requirements.txt
   ```
4. Build DBT
   ```
   cd dbt
   dbt build
   ```
5. Open Dagster
   ```
   cd dagster
   dagster dev
   ```

## References
https://docs.getdbt.com/guides/duckdb?step=1

https://github.com/dbt-labs/jaffle_shop_duckdb/

https://docs.dagster.io/integrations/libraries/dbt/using-dbt-with-dagster/
