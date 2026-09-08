import os
import shutil
import subprocess
import sys

import click

click.echo('\nProject generated. Running post-generation hooks...')
click.echo(os.getcwd())

{% if cookiecutter.__install %}

if shutil.which('mise') is not None:
    click.echo('Generating mise.lock...')
    # Cookiecutter creates a new config file, which mise requires users to trust
    # before it will use it to resolve the project toolchain.
    if os.system('mise trust') > 0 or os.system('mise lock') > 0:
        click.echo('Warning: mise lock failed, continuing without mise.lock')

if shutil.which('uv') is not None:
    click.echo('Installing dependencies with uv...')
    if os.system('uv lock') > 0:
        click.echo('Error: uv lock failed', err=True)
        sys.exit(1)

    # Recreate the venv from the committed lockfile, like CI and other developers will
    exit_code = os.system('uv sync --locked --all-groups')

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

click.echo("Done! Node >=22.12.0 and pnpm 12 are required for development; 'mise install' provides them. Run 'mise run dev' (recommended) or 'uv run dara dev'.")
