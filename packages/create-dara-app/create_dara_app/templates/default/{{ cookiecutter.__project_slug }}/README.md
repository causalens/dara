# {{ cookiecutter.project_name }}

{% if cookiecutter.__packaging == 'poetry' %}

## How to run the app

To run the application you can use the following command:

```bash
poetry run dara start
```

For development purposes it is often useful to add the `--reload` flag which will automatically reload the application when changes are made to any of the Python files.

By default this will load the config from the `config` variable in `./{{ cookiecutter.__package_name }}/main.py` module.
To see the list of available config options you can use the `--help` flag:

```bash
poetry run dara start --help
```

To see other available commands you can run:

```bash
poetry run dara
```

{% else %}

## How to run the app

To run the application you can use the following command:

```bash
dara start
```

For development purposes it is often useful to add the `--reload` flag which will automatically reload the application when changes are made to any of the Python files.

By default this will load the config from the `config` variable in `./{{ cookiecutter.__package_name }}/main.py` module.
To see the list of available config options you can use the `--help` flag:

```bash
dara start --help
```

To see other available commands you can run:

```bash
dara
```

{% endif %}
