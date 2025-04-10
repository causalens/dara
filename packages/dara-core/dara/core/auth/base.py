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

import abc
from typing import Any, ClassVar, Dict, Union

from fastapi import HTTPException, Response
from pydantic import model_serializer
from typing_extensions import TypedDict

from dara.core.auth.definitions import (
    RedirectResponse,
    SessionRequestBody,
    SuccessResponse,
    TokenData,
    TokenResponse,
)
from dara.core.base_definitions import DaraBaseModel as BaseModel


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

    @model_serializer()
    def ser_model(self) -> dict:
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

    def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
        """
        Create a new session token and refresh token from a refresh token.

        Note: the new issued session token should include the same session_id as the old token

        :param old_token: old session token data
        :param refresh_token: encoded refresh token
        :return: new session token, new refresh token
        """
        raise HTTPException(400, f'Auth config {self.__class__.__name__} does not support token refresh')

    def revoke_token(self, token: str, response: Response) -> Union[SuccessResponse, RedirectResponse]:
        """
        Revoke a session token.

        :param token: encoded token
        :param response: response object
        """
        return {'success': True}
