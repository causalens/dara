"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from contextvars import ContextVar
from datetime import datetime
from typing import List, Optional, TypedDict, Union

from pydantic import BaseModel


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
    identity_id: Optional[str] = None
    identity_name: str
    identity_email: Optional[str] = None
    id_token: Optional[str] = None
    groups: Optional[List[str]] = []

    class Config:
        smart_union = True


class UserData(BaseModel):
    """
    Describes the shape of the data stored in USER

    :param identity_id: ID of user's identity
    :param identity_name: name of user's identity
    :param identity_email: email of user's identity
    :param groups: list of groups user belongs to
    """

    identity_id: Optional[str] = None
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
