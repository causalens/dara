"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import logging
import pathlib
import shutil
import sys
from importlib.metadata import version
from typing import Literal

from cookiecutter.exceptions import FailedHookException, OutputDirExistsException
from cookiecutter.main import cookiecutter

import click

from create_dara_app.default_command_group import DefaultCommandGroup

logger = logging.getLogger('create-dara-app')

TEMPLATE_DIRECTORY = (pathlib.Path(__file__).parent / 'templates' / 'default').as_posix()


@click.group(cls=DefaultCommandGroup)
@click.version_option()
def cli():
    """
    create-dara-app CLI. Runs the `bootstrap` command when a subcommand is not specified.
    """


@cli.command(default=True)
@click.argument('directory', type=click.Path(exists=False), default='.')
@click.option('--debug', help='Enable debug logging', is_flag=True, default=False)
@click.option('--no-install', help='Skip installing dependencies', is_flag=True, default=False)
@click.option('--no-input', help='Skip all user prompting', is_flag=True, default=False)
@click.option('--project-name', help='Project name', type=str, default='Decision App')
@click.option('--package-name', help='Python package name. Example: my_decision_app', type=str)
@click.option(
    '--overwrite-if-exists',
    help='Overwrite the contents of the output directory if it exists.',
    is_flag=True,
    default=False,
)
@click.option(
    '--packaging', help='Whether to use pip or poetry', type=click.Choice(['pip', 'poetry']), default='poetry'
)
def bootstrap(
    directory: str = '.',
    debug: bool = False,
    no_install: bool = False,
    no_input: bool = False,
    project_name: str = 'Decision App',
    package_name: str = '',
    overwrite_if_exists: bool = False,
    packaging: Literal['pip', 'poetry'] = 'poetry',
):
    """
    Creates a new Decision App project under specified parent DIRECTORY with the default template.
    Uses the Dara version matching the CLI's version.
    """
    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO)

    dara_version = version('create-dara-app')
    logger.debug('Using create-dara-app version %s', dara_version)

    if packaging == 'poetry':
        # Check if poetry is available
        poetry_path = shutil.which('poetry')
        if poetry_path is None:
            logger.warning('Poetry not found. Falling back to pip.')
            packaging = 'pip'

    extra_context = {
        '__dara_version': dara_version,
        '__install': not no_install,
        '__packaging': packaging,
        'project_name': project_name,
    }

    if package_name:
        extra_context['__package_name'] = package_name

    try:
        cookiecutter(
            TEMPLATE_DIRECTORY,
            output_dir=directory,
            extra_context=extra_context,
            no_input=no_input,
            overwrite_if_exists=overwrite_if_exists,
        )
    except OutputDirExistsException as e:
        click.echo(
            f'Error: {e}. Please remove it or pick a different project name and try again.',
            err=True,
        )
        sys.exit(1)
    except FailedHookException as e:
        click.echo(e, err=True)
        sys.exit(1)
