import os
import sys

import click

click.echo('\nProject generated. Running post-generation hooks...')

python_version = sys.version_info
python_ver_string = f'{python_version.major}.{python_version.minor}'

click.echo('Creating a venv...')
# This explicitly creates a new venv for the project
exit_code = os.system(f'poetry env use {python_ver_string}')

if exit_code > 0:
    click.echo('Error: failed to create a new .venv', err=True)
    sys.exit(1)

click.echo('Installing dependencies...')
exit_code = os.system('poetry install')

if exit_code > 0:
    click.echo('Error: Poetry install failed', err=True)
    sys.exit(1)

click.echo('Generating .env...')
os.system('poetry run dara generate-env')
