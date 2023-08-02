import os
import subprocess
import sys
import venv

import click

packaging = '{{ cookiecutter.__packaging }}'

click.echo('\nProject generated. Running post-generation hooks...')
click.echo(os.getcwd())

if packaging == 'pip':
    # Remove the poetry.toml file
    os.remove('poetry.toml')

{% if cookiecutter.__install %}

if packaging == 'poetry':
    click.echo('Installing dependencies...')
    exit_code = os.system(f'poetry install')

    if exit_code > 0:
        click.echo('Error: Poetry install failed', err=True)
        sys.exit(1)

    click.echo('Generating .env...')
    os.system('poetry run dara generate-env')

if packaging == 'pip':
    click.echo('Creating a venv...')

    venv.create('.venv', with_pip=True)
    pip_path = os.path.join('.venv', 'bin', 'pip') if sys.platform != 'win32' else os.path.join('.venv', 'Scripts', 'pip.exe')

    click.echo('Upgrading pip...')
    subprocess.run([pip_path, 'install', '--upgrade', 'pip'])

    click.echo('Installing dependencies...')
    subprocess.run([pip_path, 'install', '-e', '.'])

    click.echo('Generating .env...')
    dara_path = os.path.join('.venv', 'bin', 'dara') if sys.platform != 'win32' else os.path.join('.venv', 'Scripts', 'dara.exe')
    subprocess.run([dara_path, 'generate-env'])


{% endif %}
