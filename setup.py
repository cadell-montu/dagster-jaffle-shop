from setuptools import find_packages, setup

setup(
    name="dagster_cadell",
    packages=find_packages(exclude=["dagster_cadell_tests"]),
    install_requires=[
        "dagster",
        "dagster-cloud"
    ],
    extras_require={"dev": ["dagster-webserver", "pytest"]},
)
