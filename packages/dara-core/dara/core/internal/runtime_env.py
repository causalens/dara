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

import os
from typing import Literal, cast

ServingCommand = Literal['dev', 'start']
SERVING_COMMANDS: tuple[ServingCommand, ...] = ('dev', 'start')


def serving_command() -> ServingCommand:
    """
    Parse the command that launched the ASGI app, refusing launches that bypassed the CLI.

    Posture (API docs, signing keys, frontend proxy vs. compiled artifacts) follows the command, so a
    server started without one would silently run with development posture.
    """
    command = os.environ.get('DARA_COMMAND')
    if command not in SERVING_COMMANDS:
        found = 'is not set' if command is None else f'is {command!r}'
        raise RuntimeError(
            f'DARA_COMMAND {found}. Launch the app with `dara dev` or `dara start`; to serve a build '
            'with another ASGI server, run `dara build` and set DARA_COMMAND=start.'
        )
    return cast(ServingCommand, command)


def env_flag(name: str) -> bool:
    """Return whether a Dara environment flag is enabled."""

    return os.environ.get(name, 'FALSE') == 'TRUE'


def is_backend_reload_enabled() -> bool:
    """Return whether the active development command runs a reloadable backend."""
    return os.environ.get('DARA_COMMAND') == 'dev' and env_flag('DARA_LIVE_RELOAD')


def is_deploy_mode() -> bool:
    """Deployment posture comes exclusively from dara start, including local artifact serving."""
    return os.environ.get('DARA_COMMAND') == 'start'


def is_hmr_enabled() -> bool:
    """Internal legacy helper, retained until the old build module is removed."""
    return os.environ.get('DARA_COMMAND') == 'dev'


def is_docker_mode() -> bool:
    """Internal legacy helper, retained until the old build module is removed."""
    return is_deploy_mode()


def is_production_mode() -> bool:
    """Internal legacy helper, retained until the old build module is removed."""
    return is_deploy_mode()
