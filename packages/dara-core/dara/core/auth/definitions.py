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

from contextvars import ContextVar
from datetime import datetime
from typing import List, Optional, Union

from typing_extensions import TypedDict

from dara.core.base_definitions import DaraBaseModel as BaseModel


class TokenData(BaseModel):
    """
    Describes the shape of the data stored in the JWT token

    :param session_id: ID of current user's session
    :param exp: expiration time for the token
    :param identity_id: ID of user's identity
    :param identity_name: name of user's identity
    :param identity_email: email of user's identity
    :param id_token: raw ID token, available in SSO auth
    :param groups: list of groups user belongs to
    """

    session_id: str
    exp: Union[float, int, datetime]
    identity_id: str
    identity_name: str
    identity_email: Optional[str] = None
    id_token: Optional[str] = None
    groups: Optional[List[str]] = []


class UserData(BaseModel):
    """
    Describes the shape of the data stored in USER

    :param identity_id: ID of user's identity
    :param identity_name: name of user's identity
    :param identity_email: email of user's identity
    :param groups: list of groups user belongs to
    """

    identity_id: str
    identity_name: str
    identity_email: Optional[str] = None
    groups: Optional[List[str]] = []


class TokenResponse(TypedDict):
    token: str


class RedirectResponse(TypedDict):
    redirect_uri: str


class SuccessResponse(TypedDict):
    success: bool


class SessionRequestBody(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None


class AuthError(Exception):
    detail: Union[str, dict]
    code: int

    def __init__(self, detail: Union[str, dict], code: int):
        self.detail = detail
        self.code = code


class UserGroup(BaseModel):
    """
    UserGroup definition.
    Currently does not hold any data, in the future will hold policies attached to each group.
    """

    name: str


# Possible auth errors definitions; all exceptions throw in this file must use one of the following
UNAUTHORIZED_ERROR = {'message': 'You are not authorised to access this application.', 'reason': 'unauthorized'}
EXPIRED_TOKEN_ERROR = {'message': 'Session has expired, please log in again', 'reason': 'expired'}
INVALID_TOKEN_ERROR = {'message': 'Token is invalid, please log in again', 'reason': 'invalid_token'}
INVALID_CREDENTIALS_ERROR = {'message': 'Incorrect username or password', 'reason': 'invalid_credentials'}


def OTHER_AUTH_ERROR(msg):
    return {'message': msg, 'reason': 'other'}


def BAD_REQUEST_ERROR(msg):
    return {'message': msg, 'reason': 'bad_request'}


JWT_ALGO = 'HS256'

# Context
SESSION_ID: ContextVar[Optional[str]] = ContextVar('session_id', default=None)
USER: ContextVar[Optional[UserData]] = ContextVar('user', default=None)
ID_TOKEN: ContextVar[Optional[str]] = ContextVar('id_token', default=None)
