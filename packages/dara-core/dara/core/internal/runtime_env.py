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


def env_flag(name: str) -> bool:
    """Return whether a Dara environment flag is enabled."""

    return os.environ.get(name, 'FALSE') == 'TRUE'


def is_backend_reload_enabled() -> bool:
    """Return whether Python backend reload mode is enabled."""

    return env_flag('DARA_LIVE_RELOAD')


def is_hmr_enabled() -> bool:
    """Return whether custom JS hot module reload mode is enabled."""

    return env_flag('DARA_HMR_MODE')


def is_docker_mode() -> bool:
    """Return whether Dara is running in Docker mode."""

    return env_flag('DARA_DOCKER_MODE')


def is_production_mode() -> bool:
    """Return whether Dara is running in production mode."""

    return env_flag('DARA_PRODUCTION_MODE')


def is_deploy_mode() -> bool:
    """Return whether Dara is running in a deployment mode."""

    return is_docker_mode() or is_production_mode()
