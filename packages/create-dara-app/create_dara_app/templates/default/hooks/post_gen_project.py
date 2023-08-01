import os
import subprocess
import sys
import venv

import click

packaging = '{{ cookiecutter.__packaging }}'

pip_args = '{{ cookiecutter.__pip_args }}'.split(' ')
# Filter out empty
pip_args = list(filter(None, pip_args))

poetry_args = '{{ cookiecutter.__poetry_args }}'

click.echo('\nProject generated. Running post-generation hooks...')
click.echo(os.getcwd())

{% if cookiecutter.__install %}

if packaging == 'poetry':
    click.echo('Installing dependencies...')
    exit_code = os.system(f'poetry install {poetry_args}')

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
    subprocess.run([pip_path, 'install', '-e', '.', *pip_args ])

    click.echo('Generating .env...')
    os.system('dara generate-env')


{% endif %}
