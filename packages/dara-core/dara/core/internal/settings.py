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
from functools import lru_cache
from secrets import token_hex

from dotenv import dotenv_values
from pydantic_settings import BaseSettings, SettingsConfigDict

from dara.core.internal.signing_key import PROCESS_JWT_SECRET, resolve_jwt_secret


class Settings(BaseSettings):
    jwt_secret: str = PROCESS_JWT_SECRET
    project_name: str = ''

    dara_base_url: str = ''
    dara_template_extra_js: str = ''
    auth_session_max_age_seconds: int = 7 * 24 * 60 * 60

    # Feature flags
    cgroup_memory_limit_enabled: bool = False

    model_config = SettingsConfigDict(env_file='.env', extra='allow')


def generate_env_content():
    """
    Generate valid contents of an .env file
    """
    env_content = {
        'JWT_SECRET': token_hex(32),
    }
    return '\n'.join(f'{key}={value}' for key, value in env_content.items())


def generate_env_file(filename='.env'):
    """
    Create a valid .env file
    """
    env_path = os.path.join(os.getcwd(), filename)
    env_content = generate_env_content()
    with open(env_path, 'w', encoding='utf-8') as f:
        f.write(env_content)


@lru_cache
def get_settings():
    """
    Get a cached instance of the settings, loading values from the .env if present.
    If JWT_SECRET is not configured in local development, use a persistent
    Dara-owned development secret outside the project directory.
    """

    # Test purposes - if DARA_TEST_FLAG is set then override env with .env.test
    if os.environ.get('DARA_TEST_FLAG', None) is not None:
        return Settings(**dotenv_values('.env.test'))  # type: ignore

    settings = Settings()
    settings.jwt_secret = resolve_jwt_secret(settings.jwt_secret, env_file='.env')
    return settings
