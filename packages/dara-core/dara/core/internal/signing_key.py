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
from pathlib import Path
from secrets import token_hex

from dotenv import dotenv_values
from platformdirs import user_cache_path

from dara.core.internal.app_scope import get_app_key
from dara.core.internal.runtime_env import is_deploy_mode
from dara.core.logging import dev_logger

JWT_SECRET_ENV_VAR = 'JWT_SECRET'
PROCESS_JWT_SECRET = token_hex(32)


def _has_jwt_secret_value(values: dict[str, str | None]) -> bool:
    return any(key.upper() == JWT_SECRET_ENV_VAR and value is not None for key, value in values.items())


def _has_configured_jwt_secret(env_file: str) -> bool:
    return _has_jwt_secret_value(dict(os.environ)) or _has_jwt_secret_value(dotenv_values(env_file))


def get_dev_signing_key_path() -> Path:
    return user_cache_path('dara') / 'dev-signing-keys' / get_app_key() / 'jwt-secret'


def _read_dev_signing_key(secret_path: Path) -> str | None:
    if secret_path.is_symlink() or not secret_path.is_file():
        return None

    secret = secret_path.read_text(encoding='utf-8').strip()
    if not secret:
        return None

    return secret


def _create_dev_signing_key(secret_path: Path) -> str:
    secret = token_hex(32)
    secret_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)

    try:
        # Create the key file exclusively so a concurrent startup cannot overwrite
        # a key another process just wrote. 0o600 keeps the key user-private.
        fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        # Another process won the creation race; reuse that persisted key.
        stored_secret = _read_dev_signing_key(secret_path)
        if stored_secret is not None:
            return stored_secret
        raise

    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(secret)
        f.flush()
        os.fsync(f.fileno())

    return secret


def _resolve_local_dev_signing_key() -> str:
    secret_path = get_dev_signing_key_path()
    try:
        stored_secret = _read_dev_signing_key(secret_path)
        if stored_secret is not None:
            return stored_secret
        return _create_dev_signing_key(secret_path)
    except Exception as e:
        dev_logger.warning(
            (
                'Failed to persist local development JWT_SECRET. Local auth sessions will not survive process restart '
                'until JWT_SECRET is configured or the Dara user cache directory is writable.'
            ),
            {
                'path': str(secret_path),
                'reason': str(e),
            },
        )
        return PROCESS_JWT_SECRET


def _warn_missing_production_jwt_secret():
    dev_logger.warning(
        'JWT_SECRET is not explicitly configured. Dara generated a fallback secret. '
        'This is not suitable for production because sessions may be invalidated on restart. '
        'Set JWT_SECRET via environment or a mounted secret file.'
    )


def resolve_jwt_secret(configured_secret: str, env_file: str) -> str:
    if _has_configured_jwt_secret(env_file):
        return configured_secret

    if is_deploy_mode():
        _warn_missing_production_jwt_secret()
        return PROCESS_JWT_SECRET

    return _resolve_local_dev_signing_key()
