import os
import shutil
import subprocess
import sys

import click

click.echo('\nProject generated. Running post-generation hooks...')
click.echo(os.getcwd())

{% if cookiecutter.__install %}

if shutil.which('uv') is not None:
    click.echo('Installing dependencies with uv...')
    exit_code = os.system('uv sync')

    if exit_code > 0:
        click.echo('Error: uv sync failed', err=True)
        sys.exit(1)
else:
    click.echo('uv not found. Falling back to pip...')
    subprocess.run([sys.executable, '-m', 'venv', '.venv'])
    pip_path = os.path.join('.venv', 'bin', 'pip') if sys.platform != 'win32' else os.path.join('.venv', 'Scripts', 'pip.exe')

    click.echo('Upgrading pip...')
    subprocess.run([pip_path, 'install', '--upgrade', 'pip'])

    click.echo('Installing dependencies...')
    subprocess.run([pip_path, 'install', '-e', '.'])

    click.echo('Installing dev dependencies...')
    subprocess.run([pip_path, 'install', 'ruff>=0.12.2', 'pyright>=1.1.400'])

if shutil.which('uv') is not None:
    click.echo('Generating .env...')
    os.system('uv run dara generate-env')
else:
    click.echo('Generating .env...')
    dara_path = os.path.join('.venv', 'bin', 'dara') if sys.platform != 'win32' else os.path.join('.venv', 'Scripts', 'dara.exe')
    subprocess.run([dara_path, 'generate-env'])

{% endif %}
