"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""
import logging
import pathlib
import sys
from importlib.metadata import version

import click
from cookiecutter.exceptions import FailedHookException, OutputDirExistsException
from cookiecutter.main import cookiecutter

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
def bootstrap(directory: str, debug: bool, no_install: bool):
    """
    Creates a new Decision App project under specified parent DIRECTORY with the default template.
    Uses the Dara version matching the CLI's version.
    """
    logging.basicConfig(level=logging.DEBUG if debug else logging.INFO)

    dara_version = version('create-dara-app')
    logger.debug(f'Using create-dara-app version {dara_version}')
    try:
        cookiecutter(
            TEMPLATE_DIRECTORY,
            output_dir=directory,
            extra_context={'dara_version': dara_version},
            accept_hooks=not no_install,
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
