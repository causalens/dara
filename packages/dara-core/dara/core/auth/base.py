"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

import abc
from typing import Any, ClassVar, Dict, Union

from fastapi import Response
from pydantic import BaseModel
from typing_extensions import TypedDict

from dara.core.auth.definitions import (
    RedirectResponse,
    SessionRequestBody,
    SuccessResponse,
    TokenData,
    TokenResponse,
)


class AuthComponent(TypedDict):
    """
    Defines an auth component.

    This is separate from the main component system because it is used for auth,
    before an authenticated session is created and we can use the component system.
    """

    py_module: str
    """Name of python module"""

    js_module: str
    """Name of javascript module"""

    js_name: str
    """Name of javascript component"""


class AuthComponentConfig(BaseModel):
    login: AuthComponent
    """Login component"""

    logout: AuthComponent
    """Logout component"""

    extra: Dict[str, AuthComponent] = {}
    """Extra components, map of route -> component"""

    def dict(self, *args, **kwargs):
        return {'login': self.login, 'logout': self.logout, **self.extra}


class BaseAuthConfig(BaseModel, abc.ABC):
    component_config: ClassVar[AuthComponentConfig]
    """
    Defines components to use for auth routes
    """

    @abc.abstractmethod
    def get_token(self, body: SessionRequestBody) -> Union[TokenResponse, RedirectResponse]:
        """
        Get a session token.

        Can return the token directly or choose to return a redirect response instead

        :param body: request body
        """

    @abc.abstractmethod
    def verify_token(self, token: str) -> Union[Any, TokenData]:
        """
        Verify a session token.

        Should set SESSION_ID and USER context variables

        Returns token data

        :param token: encoded token
        """

    def revoke_token(self, token: str, response: Response) -> Union[SuccessResponse, RedirectResponse]:
        """
        Revoke a session token.

        :param token: encoded token
        :param response: response object
        """
        return {'success': True}
