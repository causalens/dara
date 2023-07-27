"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
