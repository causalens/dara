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

from dataclasses import dataclass
from inspect import isawaitable

from fastapi import HTTPException

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.definitions import BAD_REQUEST_ERROR, INVALID_TOKEN_ERROR, AuthError, TokenData
from dara.core.auth.session_store import StoredAuthSession, get_auth_session_backend, get_auth_session_expiration
from dara.core.auth.utils import cached_refresh_token
from dara.core.telemetry import annotate_auth_observation, observe_auth


@dataclass(frozen=True)
class _StoredRefreshSubject:
    """Refresh subject backed by an opaque browser session entry."""

    session_token: str
    session: StoredAuthSession
    refresh_token: str


async def get_stored_auth_session(token: str) -> StoredAuthSession | None:
    """
    Return a stored auth session for an opaque browser session handle.
    """
    backend = get_auth_session_backend()
    with observe_auth(
        'session_store.get',
        attributes={'dara.auth.session_store.backend': type(backend).__name__},
    ) as observation:
        session = await backend.get(token)
        annotate_auth_observation(
            observation,
            attributes={
                'dara.auth.session_store.result': session.kind if session is not None else 'miss',
            },
        )
        return session


async def remove_auth_session(token: str) -> StoredAuthSession | None:
    """
    Remove and return a stored auth session for an opaque browser session handle.
    """
    backend = get_auth_session_backend()
    with observe_auth(
        'session_store.remove',
        attributes={'dara.auth.session_store.backend': type(backend).__name__},
    ) as observation:
        session = await backend.remove(token)
        annotate_auth_observation(
            observation,
            attributes={'dara.auth.session_store.result': 'removed' if session is not None else 'miss'},
        )
        return session


async def verify_raw_auth_token(auth_config: BaseAuthConfig, token: str) -> TokenData:
    """
    Verify a token for auth configs with sync or async verifier implementations.
    """
    with observe_auth('token.verify', system=auth_config.telemetry_system):
        verified_token = auth_config.verify_token(token)
        if isawaitable(verified_token):
            return await verified_token
        return verified_token


async def verify_auth_token(auth_config: BaseAuthConfig, token: str) -> TokenData:
    """
    Verify an auth token transported by the browser or an external bearer client.

    Opaque browser session handles are resolved first. If the handle is not present
    in the server-side store, fall back to verifying the token directly so existing
    raw bearer token integrations keep working.
    """
    stored_session = await get_stored_auth_session(token)
    if stored_session is None:
        return await verify_raw_auth_token(auth_config, token)

    return await verify_raw_auth_token(auth_config, stored_session.auth_token)


async def resolve_raw_auth_token(auth_config: BaseAuthConfig, token: str) -> str:
    """
    Return the raw auth token behind an opaque session handle.

    If no opaque session exists, verify the provided bearer token directly and
    return it as the raw token for auth config operations such as revoke.
    """
    stored_session = await get_stored_auth_session(token)
    if stored_session is None:
        await verify_raw_auth_token(auth_config, token)
        return token

    return stored_session.auth_token


async def create_auth_session(auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str:
    """
    Store raw auth token data server-side and return the browser-safe opaque handle.
    """
    backend = get_auth_session_backend()
    with observe_auth(
        'session_store.create',
        attributes={
            'dara.auth.session_store.backend': type(backend).__name__,
            'dara.auth.refresh.available': refresh_token is not None,
        },
    ):
        return await backend.create(auth_token, token_data, refresh_token=refresh_token)


def get_auth_session_cookie_expiration(token_data: TokenData, refresh_token: str | None) -> float:
    """
    Return the auth session cookie expiry before cookie grace.
    """
    return get_auth_session_expiration(token_data, refresh_token)


async def _get_refresh_subject(token: str) -> _StoredRefreshSubject:
    """
    Resolve the previous auth state for a refresh request.
    """
    stored_session = await get_stored_auth_session(token)
    if stored_session is None:
        raise AuthError(INVALID_TOKEN_ERROR, 401)

    if stored_session.refresh_token is None:
        raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('No refresh token provided'))

    return _StoredRefreshSubject(
        session_token=token, session=stored_session, refresh_token=stored_session.refresh_token
    )


async def refresh_auth_session(
    auth_config: BaseAuthConfig,
    token: str,
) -> tuple[str, TokenData, str]:
    """
    Refresh an opaque auth session.

    :return: opaque browser session token, verified new token data, and refresh token
    """
    with observe_auth('session.refresh', system=auth_config.telemetry_system):
        refresh_subject = await _get_refresh_subject(token)
        new_auth_token, new_refresh_token = await cached_refresh_token(
            auth_config.refresh_token,
            refresh_subject.session.token_data,
            refresh_subject.refresh_token,
        )

        new_token_data = await verify_raw_auth_token(auth_config, new_auth_token)

        session_token = refresh_subject.session_token
        backend = get_auth_session_backend()
        with observe_auth(
            'session_store.set',
            attributes={'dara.auth.session_store.backend': type(backend).__name__},
        ) as observation:
            updated = await backend.set(session_token, new_auth_token, new_token_data, refresh_token=new_refresh_token)
            annotate_auth_observation(
                observation,
                attributes={'dara.auth.session_store.result': 'updated' if updated else 'miss'},
            )
        if not updated:
            raise AuthError(INVALID_TOKEN_ERROR, 401)

        return session_token, new_token_data, new_refresh_token
