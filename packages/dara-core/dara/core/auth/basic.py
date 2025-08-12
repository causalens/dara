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

from typing import Any, ClassVar, Dict

import jwt
from fastapi import HTTPException

from dara.core.auth.base import AuthComponent, AuthComponentConfig, BaseAuthConfig
from dara.core.auth.definitions import (
    EXPIRED_TOKEN_ERROR,
    INVALID_CREDENTIALS_ERROR,
    INVALID_TOKEN_ERROR,
    SESSION_ID,
    USER,
    AuthError,
    SessionRequestBody,
    TokenData,
    TokenResponse,
    UserData,
)
from dara.core.auth.utils import decode_token, sign_jwt

DefaultAuthLogin = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='DefaultAuthLogin')

BasicAuthLogin = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='BasicAuthLogin')

BasicAuthLogout = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='BasicAuthLogout')


class BaseBasicAuthConfig(BaseAuthConfig):
    """
    Definition of a Base Basic Auth Config that extends the generic Auth Config. Allows for a dict of users to be
    specified and checked against when requesting auth
    """

    component_config: ClassVar[AuthComponentConfig] = AuthComponentConfig(
        login=BasicAuthLogin,
        logout=BasicAuthLogout,
    )
    users: Dict[str, str]

    def get_token(self, body: SessionRequestBody) -> TokenResponse:
        """
        Get a new session token.
        Verifies the username and password against the users dict, and returns a new token if valid.

        :param body: the request body
        """

        if not (body.username in self.users and body.password == self.users[body.username]):
            raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_ERROR)

        return {
            'token': sign_jwt(
                identity_id=body.username,
                identity_name=body.username,
                identity_email=None,
                groups=[],
            )
        }

    def verify_token(self, token: Any) -> TokenData:
        """
        Verifies the decoded jwt token.

        :param token: the decoded jwt token
        """
        try:
            decoded = decode_token(token)
            SESSION_ID.set(decoded.session_id)
            USER.set(
                UserData(
                    identity_id=decoded.identity_name,
                    identity_name=decoded.identity_name,
                )
            )
            return decoded
        except jwt.ExpiredSignatureError as e:
            raise AuthError(EXPIRED_TOKEN_ERROR, 401) from e
        except jwt.DecodeError as e:
            raise AuthError(INVALID_TOKEN_ERROR, 401) from e


class BasicAuthConfig(BaseBasicAuthConfig):
    """Authenticate the dashboard with a single user"""

    def __init__(self, username: str, password: str):
        super().__init__(users={username: password})


class MultiBasicAuthConfig(BaseBasicAuthConfig):
    """Authenticate the dashboard with multiple users"""

    def __init__(self, users: Dict[str, str]):
        super().__init__(users=users)


class DefaultAuthConfig(BaseAuthConfig):
    """
    Default no-auth auth config, useful for local development
    """

    component_config: ClassVar[AuthComponentConfig] = AuthComponentConfig(
        login=DefaultAuthLogin,
        logout=BasicAuthLogout,
    )

    def get_token(self, body: SessionRequestBody) -> TokenResponse:
        """
        Get a session token.

        In default auth a new token is returned every time.
        """
        token = sign_jwt(identity_id='user', identity_name='user', identity_email=None, groups=[])
        return {'token': token}

    def verify_token(self, token: str) -> TokenData:
        """
        Verify the session token.

        In default auth, the token is just decoded and returned.

        :param token: the token to verify
        """
        try:
            decoded = decode_token(token)
            SESSION_ID.set(decoded.session_id)
            # Implicit auth assumes used by one user so all users are the same
            USER.set(
                UserData(
                    identity_id=decoded.identity_id,
                    identity_name=decoded.identity_id,
                )
            )
            return decoded
        except jwt.ExpiredSignatureError as e:
            raise AuthError(EXPIRED_TOKEN_ERROR, 401) from e
        except jwt.DecodeError as e:
            raise AuthError(INVALID_TOKEN_ERROR, 401) from e
