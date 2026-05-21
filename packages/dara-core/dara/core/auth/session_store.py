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

import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

import anyio

from dara.core.auth.definitions import TokenData
from dara.core.auth.utils import AUTH_COOKIE_EXPIRATION_GRACE_SECONDS


@dataclass(frozen=True)
class AuthSession:
    """Stored auth session data keyed by an opaque browser token."""

    auth_token: str
    token_data: TokenData
    refresh_token: str | None = None


@dataclass(frozen=True)
class ActiveAuthSession(AuthSession):
    """Stored session whose auth token is still within its exp claim."""

    kind: Literal['active'] = 'active'


@dataclass(frozen=True)
class ExpiredAuthSession(AuthSession):
    """Stored session whose auth token is expired but still retained for refresh continuity."""

    kind: Literal['expired'] = 'expired'


StoredAuthSession = ActiveAuthSession | ExpiredAuthSession


@dataclass
class _SessionEntry:
    session: AuthSession
    token_expires_at: float
    retention_expires_at: float


class AuthSessionStore:
    """
    In-memory auth session store keyed by opaque browser cookie values.

    Auth configs keep issuing and verifying their normal tokens. This store only
    keeps those tokens server-side and gives the browser a random handle.
    """

    def __init__(self):
        self._entries: dict[str, _SessionEntry] = {}
        self._lock = anyio.Lock()

    @staticmethod
    def generate_session_token() -> str:
        """Generate a high-entropy opaque token safe for cookie values."""

        return secrets.token_urlsafe(32)

    @staticmethod
    def _to_timestamp(exp: datetime | int | float) -> float:
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                return exp.replace(tzinfo=timezone.utc).timestamp()
            return exp.timestamp()
        return float(exp)

    def _prune_expired_locked(self, now: float):
        expired = [session_token for session_token, entry in self._entries.items() if entry.retention_expires_at <= now]
        for session_token in expired:
            self._entries.pop(session_token, None)

    def _set_locked(
        self,
        session_token: str,
        auth_token: str,
        token_data: TokenData,
        refresh_token: str | None,
        now: float,
    ):
        token_expires_at = self._to_timestamp(token_data.exp)
        retention_expires_at = token_expires_at + AUTH_COOKIE_EXPIRATION_GRACE_SECONDS
        if retention_expires_at <= now:
            self._entries.pop(session_token, None)
            raise ValueError('Cannot store an auth session that is already beyond refresh retention')

        self._entries[session_token] = _SessionEntry(
            session=AuthSession(
                auth_token=auth_token,
                token_data=token_data.model_copy(deep=True),
                refresh_token=refresh_token,
            ),
            token_expires_at=token_expires_at,
            retention_expires_at=retention_expires_at,
        )

    async def create(self, auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str:
        """Store an auth token under a new opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)

            session_token = self.generate_session_token()
            while session_token in self._entries:
                session_token = self.generate_session_token()

            self._set_locked(session_token, auth_token, token_data, refresh_token, now)
            return session_token

    async def set(
        self,
        session_token: str,
        auth_token: str,
        token_data: TokenData,
        refresh_token: str | None = None,
    ):
        """Store or replace the auth token for an existing opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)
            self._set_locked(session_token, auth_token, token_data, refresh_token, now)

    @staticmethod
    def _build_session(entry: _SessionEntry, now: float) -> StoredAuthSession:
        session_type = ExpiredAuthSession if entry.token_expires_at <= now else ActiveAuthSession
        return session_type(
            auth_token=entry.session.auth_token,
            token_data=entry.session.token_data.model_copy(deep=True),
            refresh_token=entry.session.refresh_token,
        )

    async def get(self, session_token: str) -> StoredAuthSession | None:
        """Return the server-side auth session for an opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)

            entry = self._entries.get(session_token)
            if entry is None:
                return None

            return self._build_session(entry, now)

    async def remove(self, session_token: str) -> StoredAuthSession | None:
        now = time.time()
        async with self._lock:
            entry = self._entries.pop(session_token, None)
            if entry is None:
                return None
            return self._build_session(entry, now)

    async def clear(self):
        async with self._lock:
            self._entries.clear()


auth_session_store = AuthSessionStore()
