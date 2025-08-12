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
from typing import List, Optional

from dotenv import dotenv_values
from pydantic_settings import BaseSettings, SettingsConfigDict

from dara.core.logging import dev_logger


class Settings(BaseSettings):
    jwt_secret: str = token_hex(32)
    project_name: str = ''

    dara_base_url: str = ''
    dara_template_extra_js: str = ''

    # Feature flags
    cgroup_memory_limit_enabled: bool = False

    # SSO envs
    sso_issuer_url: str = 'https://login.causalens.com/api/authentication'
    sso_client_id: str = ''
    sso_client_secret: str = ''
    sso_redirect_uri: str = ''
    sso_groups: str = ''
    sso_jwt_algo: str = 'ES256'
    sso_verify_audience: bool = False
    sso_extra_audience: Optional[List[str]] = None
    model_config = SettingsConfigDict(env_file='.env', extra='allow')


def generate_env_content():
    """
    Generate valid contents of an .env file
    """
    env_content = {
        'JWT_SECRET': token_hex(32),
        'SSO_ISSUER_URL': '',
        'SSO_CLIENT_ID': '',
        'SSO_CLIENT_SECRET': '',
        'SSO_REDIRECT_URI': '',
        'SSO_GROUPS': 'Everyone',
        'SSO_VERIFY_AUDIENCE': False,
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
    If .env is not present, prints a warning and generates one for the user.
    """

    # Test purposes - if DARA_TEST_FLAG is set then override env with .env.test
    if os.environ.get('DARA_TEST_FLAG', None) is not None:
        return Settings(**dotenv_values('.env.test'))  # type: ignore

    env_error = False

    # Generate .env file if it's missing
    if not os.path.isfile(os.path.join(os.getcwd(), '.env')):
        dev_logger.debug('.env file not found, generating the file...')
        try:
            generate_env_file()
        except Exception as e:
            dev_logger.error('Failed to generate .env file, falling back to default settings', error=e)
            env_error = True

    settings_kwargs = {}
    if env_error:
        settings_kwargs['_env_file'] = None

    # If AUDIENCE sso env variants are provided, use them and force verify audience to True
    # SSO_VERIFY_AUDIENCE can be set explicitly to False to override this behavior.
    dotenv_vals = dotenv_values(os.path.join(os.getcwd(), '.env')) if not env_error else {}
    audience_id = os.environ.get('SSO_AUDIENCE_CLIENT_ID', dotenv_vals.get('SSO_AUDIENCE_CLIENT_ID'))
    audience_secret = os.environ.get('SSO_AUDIENCE_CLIENT_SECRET', dotenv_vals.get('SSO_AUDIENCE_CLIENT_SECRET'))
    enable_audience_check = os.environ.get('SSO_VERIFY_AUDIENCE', dotenv_vals.get('SSO_VERIFY_AUDIENCE'))
    if enable_audience_check != 'False' and audience_id is not None and audience_secret is not None:
        return Settings(
            sso_client_id=audience_id, sso_client_secret=audience_secret, sso_verify_audience=True, **settings_kwargs
        )

    return Settings(**settings_kwargs)
