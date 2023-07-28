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

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Union

import jwt

from dara.core.auth.definitions import (
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    JWT_ALGO,
    USER,
    AuthError,
    TokenData,
)
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger


def decode_token(token: str) -> TokenData:
    """
    Decode a JWT token
    """
    try:
        return TokenData.parse_obj(jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGO]))
    except jwt.ExpiredSignatureError:
        raise AuthError(code=401, detail=EXPIRED_TOKEN_ERROR)
    except jwt.DecodeError:
        raise AuthError(code=401, detail=INVALID_TOKEN_ERROR)


def sign_jwt(
    identity_id: Optional[str],
    identity_name: str,
    identity_email: Optional[str],
    groups: List[str],
    id_token: Optional[str] = None,
    exp: Optional[Union[datetime, int]] = None,
):
    """
    Create a new Dara JWT token
    """
    session_id = str(uuid.uuid4())

    # Default expiry is 1 day unless specified
    if exp is None:
        exp = datetime.now(tz=timezone.utc) + timedelta(days=1)

    settings = get_settings()
    return jwt.encode(
        TokenData(
            session_id=session_id,
            exp=exp,
            identity_id=identity_id,
            identity_name=identity_name,
            identity_email=identity_email,
            groups=groups,
            id_token=id_token,
        ).dict(),
        settings.jwt_secret,
        algorithm=JWT_ALGO,
    )


def get_user_data():
    """
    Helper to get currently logged in user data.
    Dara can only provide user data when it can determine the currently logged in user, i.e. inside
    a DerivedVariable function, an action handler or inside a @py_component.
    """
    user_data = USER.get()

    if user_data is None:
        dev_logger.warning(
            'No UserData found. This could mean that get_user_data has been '
            'executed outside of user-specific context. UserData is only accessible '
            'when Dara can determine the currently logged in user, i.e. inside a DerivedVariable function, '
            'an action handler or inside a @py_components'
        )

    return user_data
