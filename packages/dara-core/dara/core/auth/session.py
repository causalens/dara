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
from uuid import uuid4

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.definitions import TokenData
from dara.core.auth.session_store import StoredAuthSession, auth_session_store
from dara.core.auth.utils import cached_refresh_token, decode_token


@dataclass(frozen=True)
class _StoredRefreshSubject:
    """Refresh subject backed by an opaque browser session entry."""

    session_token: str
    session: StoredAuthSession


@dataclass(frozen=True)
class _RawTokenRefreshSubject:
    """Refresh subject backed by a decoded raw auth token."""

    token_data: TokenData


@dataclass(frozen=True)
class _NewSessionRefreshSubject:
    """Refresh subject for a missing opaque session where only continuity can be preserved."""

    session_id: str


_RefreshSubject = _StoredRefreshSubject | _RawTokenRefreshSubject | _NewSessionRefreshSubject


async def get_stored_auth_session(token: str, *, touch: bool = True) -> StoredAuthSession | None:
    """
    Return a stored auth session when the supplied token is an opaque browser session handle.
    """
    if not auth_session_store.is_session_token(token):
        return None

    return await auth_session_store.get(token, touch=touch)


async def remove_auth_session(token: str) -> StoredAuthSession | None:
    """
    Remove and return a stored auth session when the supplied token is an opaque browser session handle.
    """
    if not auth_session_store.is_session_token(token):
        return None

    return await auth_session_store.remove(token)


async def verify_raw_auth_token(auth_config: BaseAuthConfig, token: str) -> TokenData:
    """
    Verify a token for auth configs with sync or async verifier implementations.
    """
    verified_token = auth_config.verify_token(token)
    if isawaitable(verified_token):
        return await verified_token
    return verified_token


async def verify_auth_token(auth_config: BaseAuthConfig, token: str) -> TokenData:
    """
    Resolve an opaque browser session token and verify the auth config's raw token.
    """
    stored_session = await get_stored_auth_session(token)
    raw_token = stored_session.auth_token if stored_session is not None else token
    return await verify_raw_auth_token(auth_config, raw_token)


async def resolve_raw_auth_token(token: str, *, touch: bool = True) -> str:
    """
    Return the raw auth token behind an opaque session handle, or the supplied token when it is already raw.
    """
    stored_session = await get_stored_auth_session(token, touch=touch)
    return stored_session.auth_token if stored_session is not None else token


async def create_auth_session(auth_token: str, token_data: TokenData) -> str:
    """
    Store raw auth token data server-side and return the browser-safe opaque handle.
    """
    return await auth_session_store.create(auth_token, token_data)


async def _get_refresh_subject(token: str) -> _RefreshSubject:
    """
    Resolve the previous auth state for a refresh request.

    A missing opaque session can still preserve session continuity, but it does not have user claims yet. The refreshed
    token response must establish those claims instead of accepting fake TokenData.
    """
    stored_session = await get_stored_auth_session(token)
    if stored_session is not None:
        return _StoredRefreshSubject(session_token=token, session=stored_session)

    if auth_session_store.is_session_token(token):
        return _NewSessionRefreshSubject(session_id=str(uuid4()))

    return _RawTokenRefreshSubject(token_data=decode_token(token, options={'verify_exp': False}))


async def refresh_auth_session(
    auth_config: BaseAuthConfig,
    token: str,
    refresh_token: str,
) -> tuple[str, TokenData, str]:
    """
    Refresh a raw or opaque auth session.

    :return: opaque browser session token, verified new token data, refresh token to store in the browser
    """
    refresh_subject = await _get_refresh_subject(token)
    if isinstance(refresh_subject, _StoredRefreshSubject):
        new_auth_token, new_refresh_token = await cached_refresh_token(
            auth_config.refresh_token,
            refresh_subject.session.token_data,
            refresh_token,
        )
    elif isinstance(refresh_subject, _RawTokenRefreshSubject):
        new_auth_token, new_refresh_token = await cached_refresh_token(
            auth_config.refresh_token,
            refresh_subject.token_data,
            refresh_token,
        )
    else:
        new_auth_token, new_refresh_token = await cached_refresh_token(
            auth_config.refresh_token_from_session_id,
            refresh_subject.session_id,
            refresh_token,
        )

    new_token_data = await verify_raw_auth_token(auth_config, new_auth_token)

    if isinstance(refresh_subject, _StoredRefreshSubject):
        session_token = refresh_subject.session_token
        await auth_session_store.set(session_token, new_auth_token, new_token_data)
    else:
        session_token = await create_auth_session(new_auth_token, new_token_data)

    return session_token, new_token_data, new_refresh_token
