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

import json
import os
import re
import secrets
import tempfile
import time
from collections import OrderedDict
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import TYPE_CHECKING, Literal, Protocol, runtime_checkable

import anyio
from anyio import to_thread
from pydantic import ValidationError

from dara.core.auth.definitions import TokenData
from dara.core.auth.utils import AUTH_COOKIE_EXPIRATION_GRACE_SECONDS, get_token_expiration
from dara.core.internal.app_scope import get_app_key
from dara.core.internal.runtime_env import is_backend_reload_enabled, is_deploy_mode
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger

if TYPE_CHECKING:
    from dara.core.configuration import Configuration

AUTH_SESSION_BACKEND_REGISTRY_KEY = 'AuthSessionBackend'
AUTH_SESSION_FILE_ENV_VAR = 'DARA_AUTH_SESSION_FILE_PATH'
AUTH_SESSION_FILE_NAME_PATTERN = re.compile(r'^[0-9a-f]{64}\.json$')
MAX_AUTH_SESSION_FILE_BYTES = 1024 * 1024


def generate_auth_session_token() -> str:
    """Generate a high-entropy opaque token safe for cookie values."""

    return secrets.token_urlsafe(32)


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


def _to_timestamp(exp: datetime | int | float) -> float:
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            return exp.replace(tzinfo=timezone.utc).timestamp()
        return exp.timestamp()
    return float(exp)


def get_auth_session_expiration(token_data: TokenData, refresh_token: str | None) -> float:
    """
    Return the absolute session handle expiration before auth cookie grace.

    If no refresh token exists, the handle follows the auth token expiry. If a
    refresh token has an exp claim, the handle follows the later of auth-token
    and refresh-token expiry. Opaque refresh tokens with no exp claim use the
    configured sliding max session age.
    """
    token_expires_at = _to_timestamp(token_data.exp)
    if refresh_token is None:
        return token_expires_at

    refresh_token_expires_at = get_token_expiration(refresh_token)
    if refresh_token_expires_at is None:
        return time.time() + get_settings().auth_session_max_age_seconds

    return max(token_expires_at, float(refresh_token_expires_at))


def _build_session_entry(
    auth_token: str,
    token_data: TokenData,
    refresh_token: str | None,
    now: float,
) -> _SessionEntry:
    token_expires_at = _to_timestamp(token_data.exp)
    session_expires_at = get_auth_session_expiration(token_data, refresh_token)
    retention_expires_at = session_expires_at + AUTH_COOKIE_EXPIRATION_GRACE_SECONDS
    if retention_expires_at <= now:
        raise ValueError('Cannot store an auth session that is already beyond refresh retention')

    return _SessionEntry(
        session=AuthSession(
            auth_token=auth_token,
            token_data=token_data.model_copy(deep=True),
            refresh_token=refresh_token,
        ),
        token_expires_at=token_expires_at,
        retention_expires_at=retention_expires_at,
    )


def _build_stored_session(entry: _SessionEntry, now: float) -> StoredAuthSession:
    session_type = ExpiredAuthSession if entry.token_expires_at <= now else ActiveAuthSession
    return session_type(
        auth_token=entry.session.auth_token,
        token_data=entry.session.token_data.model_copy(deep=True),
        refresh_token=entry.session.refresh_token,
    )


@runtime_checkable
class AuthSessionBackend(Protocol):
    """Storage backend for opaque browser auth sessions."""

    async def create(self, auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str:
        """Store an auth token under a new opaque session token."""
        ...

    async def set(
        self,
        session_token: str,
        auth_token: str,
        token_data: TokenData,
        refresh_token: str | None = None,
    ) -> bool:
        """Replace an existing opaque session token."""
        ...

    async def get(self, session_token: str) -> StoredAuthSession | None:
        """Return the server-side auth session for an opaque session token."""
        ...

    async def remove(self, session_token: str) -> StoredAuthSession | None:
        """Remove and return the server-side auth session for an opaque session token."""
        ...

    async def clear(self):
        """Remove all stored auth sessions."""
        ...

    async def clear_expired(self):
        """Remove expired auth sessions."""
        ...


AuthSessionBackendFactory = Callable[['Configuration'], AuthSessionBackend]
AuthSessionBackendConfig = AuthSessionBackend | AuthSessionBackendFactory


class InMemoryAuthSessionBackend:
    """
    In-memory auth session backend keyed by opaque browser cookie values.

    Auth configs keep issuing and verifying their normal tokens. This backend only
    keeps those tokens server-side and gives the browser a random handle.
    """

    def __init__(self):
        self._entries: dict[str, _SessionEntry] = {}
        self._lock = anyio.Lock()

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
        try:
            entry = _build_session_entry(auth_token, token_data, refresh_token, now)
        except ValueError:
            self._entries.pop(session_token, None)
            raise

        self._entries[session_token] = entry

    async def create(self, auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str:
        """Store an auth token under a new opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)

            session_token = generate_auth_session_token()
            while session_token in self._entries:
                session_token = generate_auth_session_token()

            self._set_locked(session_token, auth_token, token_data, refresh_token, now)
            return session_token

    async def set(
        self,
        session_token: str,
        auth_token: str,
        token_data: TokenData,
        refresh_token: str | None = None,
    ) -> bool:
        """Replace the auth token for an existing opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)
            if session_token not in self._entries:
                return False

            self._set_locked(session_token, auth_token, token_data, refresh_token, now)
            return True

    async def get(self, session_token: str) -> StoredAuthSession | None:
        """Return the server-side auth session for an opaque session token."""

        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)

            entry = self._entries.get(session_token)
            if entry is None:
                return None

            return _build_stored_session(entry, now)

    async def remove(self, session_token: str) -> StoredAuthSession | None:
        now = time.time()
        async with self._lock:
            entry = self._entries.pop(session_token, None)
            if entry is None:
                return None
            return _build_stored_session(entry, now)

    async def clear(self):
        async with self._lock:
            self._entries.clear()

    async def clear_expired(self):
        now = time.time()
        async with self._lock:
            self._prune_expired_locked(now)


class FileAuthSessionBackend:
    """
    File auth session backend keyed by opaque browser cookie values.

    Stores one complete auth session snapshot per file. Filenames are derived
    from the opaque session handle hash and never contain the raw handle.
    """

    def __init__(self, path: str | Path | None = None, cache_size: int = 1024):
        """
        Create a file-backed auth session store.

        :param path: Existing directory to use for session files. When omitted,
            `DARA_AUTH_SESSION_FILE_PATH` is used if set; otherwise a Dara-owned
            app-scoped directory under the platform temp directory is created.
        :param cache_size: Maximum number of sessions to keep in the in-process
            read-through cache. Set to 0 to disable caching.
        """
        if cache_size < 0:
            raise ValueError('cache_size must be greater than or equal to 0')

        self.root = self._resolve_root(path)
        self.cache_size = cache_size
        self._cache: OrderedDict[str, _SessionEntry] = OrderedDict()
        # Serialize public operations within this backend instance so a
        # refresh-time set cannot recreate a session removed by logout/revoke.
        self._lock = anyio.Lock()

    @staticmethod
    def _default_root() -> Path:
        """
        Return the default app-scoped temp directory for auth session files.
        """
        return Path(tempfile.gettempdir()) / 'dara-sessions' / get_app_key()

    @classmethod
    def _resolve_root(cls, path: str | Path | None) -> Path:
        """
        Resolve and validate the directory used to store session files.

        :param path: Explicit root directory. Explicit and env-provided paths
            must already exist; only the default temp path is created.
        """
        configured_path = path or os.environ.get(AUTH_SESSION_FILE_ENV_VAR)
        if configured_path is not None:
            root = Path(configured_path).expanduser().resolve()
            cls._validate_existing_root(root)
            return root

        root = cls._default_root()
        if root.is_symlink():
            raise RuntimeError(f'Auth session file backend root cannot be a symlink: {root}')

        root.mkdir(mode=0o700, parents=True, exist_ok=True)
        cls._set_owner_only_directory_permissions(root)
        cls._validate_existing_root(root)
        return root

    @staticmethod
    def _validate_existing_root(root: Path):
        """
        Validate that a resolved root is an existing writable directory.

        :param root: Directory path to validate.
        """
        if root.is_symlink():
            raise RuntimeError(f'Auth session file backend root cannot be a symlink: {root}')
        if not root.exists():
            raise RuntimeError(f'Auth session file backend root does not exist: {root}')
        if not root.is_dir():
            raise RuntimeError(f'Auth session file backend root is not a directory: {root}')
        if not os.access(root, os.R_OK | os.W_OK | os.X_OK):
            raise RuntimeError(f'Auth session file backend root is not readable and writable: {root}')

    @staticmethod
    def _set_owner_only_directory_permissions(root: Path):
        """
        Apply owner-only permissions to the default root directory.

        :param root: Directory to secure.
        """
        try:
            root.chmod(0o700)
        except OSError as e:
            raise RuntimeError(f'Failed to secure auth session file backend root: {root}') from e

    @staticmethod
    def _session_file_name(session_token: str) -> str:
        """
        Return the safe filename for a session token.

        :param session_token: Opaque browser session handle.
        """
        return sha256(session_token.encode()).hexdigest() + '.json'

    def _session_file_path(self, session_token: str) -> anyio.Path:
        """
        Return the storage path for a session token.

        :param session_token: Opaque browser session handle.
        """
        return anyio.Path(self.root / self._session_file_name(session_token))

    def _cache_entry(self, session_token: str, entry: _SessionEntry):
        """
        Store an entry in the in-process read-through cache.

        :param session_token: Opaque browser session handle.
        :param entry: Parsed session entry to cache.
        """
        if self.cache_size == 0:
            return

        self._cache[session_token] = entry
        self._cache.move_to_end(session_token)

        while len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)

    @staticmethod
    def _is_session_file(path: anyio.Path) -> bool:
        """
        Check whether a path has the expected session-file name shape.

        :param path: Path to inspect.
        """
        return bool(AUTH_SESSION_FILE_NAME_PATTERN.fullmatch(path.name))

    @staticmethod
    def _warn_ignored_file(path: anyio.Path, reason: str):
        """
        Log that a file was ignored without exposing token material.

        :param path: Ignored file path.
        :param reason: Sanitized reason code.
        """
        dev_logger.warning(
            'Ignoring auth session file',
            extra={
                'file': path.name,
                'reason': reason,
            },
        )

    async def _read_entry_file(self, path: anyio.Path) -> _SessionEntry | None:
        """
        Read and parse a session file without blocking the event loop.

        :param path: Expected session file path.
        """
        if not self._is_session_file(path):
            return None
        if await path.is_symlink():
            self._warn_ignored_file(path, 'symlink')
            return None

        try:
            if not await path.exists():
                return None
            if not await path.is_file():
                self._warn_ignored_file(path, 'not_file')
                return None
            if (await path.stat()).st_size > MAX_AUTH_SESSION_FILE_BYTES:
                self._warn_ignored_file(path, 'oversized')
                return None

            payload = json.loads(await path.read_text(encoding='utf-8'))

            if not isinstance(payload, dict):
                raise ValueError('Payload is not an object')

            auth_token = payload['auth_token']
            refresh_token = payload.get('refresh_token')
            if not isinstance(auth_token, str):
                raise ValueError('auth_token is not a string')
            if refresh_token is not None and not isinstance(refresh_token, str):
                raise ValueError('refresh_token is not a string')

            token_data = TokenData.model_validate(payload['token_data'])
            token_expires_at = float(payload['token_expires_at'])
            retention_expires_at = float(payload['retention_expires_at'])

            return _SessionEntry(
                session=AuthSession(
                    auth_token=auth_token,
                    token_data=token_data,
                    refresh_token=refresh_token,
                ),
                token_expires_at=token_expires_at,
                retention_expires_at=retention_expires_at,
            )
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError, ValidationError):
            self._warn_ignored_file(path, 'malformed')
            return None

    @staticmethod
    def _payload_from_entry(entry: _SessionEntry) -> dict:
        """
        Convert a session entry to the JSON payload stored on disk.

        :param entry: Session entry to serialize.
        """
        return {
            'auth_token': entry.session.auth_token,
            'refresh_token': entry.session.refresh_token,
            'token_data': entry.session.token_data.model_dump(mode='json'),
            'token_expires_at': entry.token_expires_at,
            'retention_expires_at': entry.retention_expires_at,
        }

    async def _write_entry_file(self, path: anyio.Path, entry: _SessionEntry):
        """
        Atomically write a complete session snapshot.

        :param path: Final session file path.
        :param entry: Session entry to write.
        """
        tmp_path = anyio.Path(self.root / f'.{path.stem}.{os.getpid()}.{secrets.token_hex(8)}.tmp')

        def opener(file_path: str, flags: int) -> int:
            return os.open(file_path, flags | os.O_CREAT | os.O_EXCL, 0o600)

        try:
            # Write to a unique temporary file in the same directory so
            # os.replace below can publish the snapshot atomically on a single
            # filesystem. O_WRONLY opens for writing only, O_CREAT creates the
            # file, and O_EXCL fails if our random temp name already exists.
            # The 0o600 mode gives read/write access only to the owner because
            # auth session files contain raw auth token material.
            async with await anyio.open_file(tmp_path, 'w', encoding='utf-8', opener=opener) as file:
                await file.write(json.dumps(self._payload_from_entry(entry), separators=(',', ':')))
                # Flush Python and kernel buffers before publishing the file,
                # so a crash cannot leave the final path pointing at a partial
                # JSON payload.
                await file.flush()
                await to_thread.run_sync(os.fsync, file.wrapped.fileno())

            # Readers should observe either the old complete file or the new
            # complete file, never an in-place rewrite.
            await tmp_path.replace(path)
            # fsync the directory so the rename itself is durable on filesystems
            # that require directory metadata to be flushed separately.
            await self._fsync_root()
        except Exception:
            with suppress(OSError):
                await tmp_path.unlink(missing_ok=True)
            raise

    async def _fsync_root(self):
        """
        Best-effort fsync of the session directory metadata.
        """

        def fsync_root_sync():
            try:
                fd = os.open(self.root, os.O_RDONLY)
            except OSError:
                return

            try:
                os.fsync(fd)
            except OSError:
                pass
            finally:
                os.close(fd)

        await to_thread.run_sync(fsync_root_sync)

    async def _remove_file(self, path: anyio.Path):
        """
        Remove a session file if it exists.

        :param path: Session file path to delete.
        """
        with suppress(FileNotFoundError):
            await path.unlink()

    async def _valid_session_files(self):
        """
        Yield files matching the session-file name pattern.
        """
        try:
            async for path in anyio.Path(self.root).iterdir():
                if self._is_session_file(path):
                    yield path
        except OSError as e:
            raise RuntimeError(f'Failed to list auth session file backend root: {self.root}') from e

    async def _get_entry_unlocked(self, session_token: str, now: float) -> _SessionEntry | None:
        """
        Return a session entry without acquiring the backend lock.

        :param session_token: Opaque browser session handle.
        :param now: Current timestamp used for expiration checks.
        """
        cached_entry = self._cache.get(session_token)
        if cached_entry is not None:
            if cached_entry.retention_expires_at <= now:
                self._cache.pop(session_token, None)
                await self._remove_file(self._session_file_path(session_token))
                return None

            self._cache.move_to_end(session_token)
            return cached_entry

        path = self._session_file_path(session_token)
        entry = await self._read_entry_file(path)
        if entry is None:
            return None

        if entry.retention_expires_at <= now:
            await self._remove_file(path)
            return None

        self._cache_entry(session_token, entry)
        return entry

    async def _get_unlocked(self, session_token: str, now: float) -> StoredAuthSession | None:
        """
        Return a stored session without acquiring the backend lock.

        :param session_token: Opaque browser session handle.
        :param now: Current timestamp used for expiration checks.
        """
        entry = await self._get_entry_unlocked(session_token, now)
        if entry is None:
            return None

        return _build_stored_session(entry, now)

    async def create(self, auth_token: str, token_data: TokenData, refresh_token: str | None = None) -> str:
        """
        Store an auth token under a new opaque session token.

        :param auth_token: Raw auth token to store server-side.
        :param token_data: Decoded token claims used for session metadata.
        :param refresh_token: Optional raw refresh token for refresh continuity.
        """

        now = time.time()
        entry = _build_session_entry(auth_token, token_data, refresh_token, now)

        async with self._lock:
            session_token = generate_auth_session_token()
            path = self._session_file_path(session_token)
            # Token collisions are cryptographically unlikely, but create must never
            # overwrite an existing session file when one does happen.
            while await path.exists():
                session_token = generate_auth_session_token()
                path = self._session_file_path(session_token)

            await self._write_entry_file(path, entry)
            self._cache_entry(session_token, entry)
            return session_token

    async def set(
        self,
        session_token: str,
        auth_token: str,
        token_data: TokenData,
        refresh_token: str | None = None,
    ) -> bool:
        """
        Replace the auth token for an existing opaque session token.

        :param session_token: Opaque browser session handle to update.
        :param auth_token: New raw auth token to store server-side.
        :param token_data: Decoded token claims for the new auth token.
        :param refresh_token: Optional new raw refresh token.
        """

        now = time.time()
        async with self._lock:
            path = self._session_file_path(session_token)
            existing_entry = await self._get_entry_unlocked(session_token, now)
            if existing_entry is None:
                return False

            try:
                entry = _build_session_entry(auth_token, token_data, refresh_token, now)
            except ValueError:
                await self._remove_file(path)
                raise

            if not await path.exists():
                self._cache.pop(session_token, None)
                return False

            await self._write_entry_file(path, entry)
            self._cache_entry(session_token, entry)
            return True

    async def get(self, session_token: str) -> StoredAuthSession | None:
        """
        Return the server-side auth session for an opaque session token.

        :param session_token: Opaque browser session handle.
        """

        now = time.time()
        async with self._lock:
            return await self._get_unlocked(session_token, now)

    async def remove(self, session_token: str) -> StoredAuthSession | None:
        """
        Remove and return the server-side auth session for an opaque token.

        :param session_token: Opaque browser session handle to remove.
        """
        now = time.time()
        async with self._lock:
            path = self._session_file_path(session_token)
            stored_session = await self._get_unlocked(session_token, now)
            await self._remove_file(path)
            self._cache.pop(session_token, None)
            return stored_session

    async def clear(self):
        """
        Remove all valid session files in this backend root.
        """
        async with self._lock:
            async for path in self._valid_session_files():
                if await path.is_symlink():
                    continue
                await self._remove_file(path)
            self._cache.clear()

    async def clear_expired(self):
        """
        Remove valid session files whose retention window has expired.
        """
        now = time.time()
        async with self._lock:
            expired_cache_tokens = [
                session_token for session_token, entry in self._cache.items() if entry.retention_expires_at <= now
            ]
            for session_token in expired_cache_tokens:
                self._cache.pop(session_token, None)
                await self._remove_file(self._session_file_path(session_token))

            async for path in self._valid_session_files():
                entry = await self._read_entry_file(path)
                if entry is not None and entry.retention_expires_at <= now:
                    await self._remove_file(path)


def _should_use_file_auth_sessions_by_default() -> bool:
    return is_backend_reload_enabled() and not is_deploy_mode()


def auto_auth_session_backend(config: 'Configuration') -> AuthSessionBackend:
    """
    Select the default auth session backend for the current runtime.

    Local reload development uses file-backed sessions so browser auth handles
    survive process restarts. Other modes use process-local in-memory sessions.
    """

    if _should_use_file_auth_sessions_by_default():
        return FileAuthSessionBackend()

    return InMemoryAuthSessionBackend()


def resolve_auth_session_backend(
    auth_session_backend: AuthSessionBackendConfig,
    config: 'Configuration',
) -> AuthSessionBackend:
    """
    Resolve a configured auth session backend object or factory into a concrete backend.

    The factory path is called once during application startup so auth requests
    always use a stable concrete backend for the lifetime of the process.
    """

    if isinstance(auth_session_backend, AuthSessionBackend):
        backend = auth_session_backend
    else:
        backend = auth_session_backend(config)

    if not isinstance(backend, AuthSessionBackend):
        raise TypeError('auth_session_backend must be an AuthSessionBackend or a factory returning one')

    dev_logger.info('Using auth session backend', {'backend': backend.__class__.__name__})

    if isinstance(backend, FileAuthSessionBackend) and not _should_use_file_auth_sessions_by_default():
        dev_logger.warning(
            'File auth session backend is local disk storage and stores raw auth session material',
            {
                'path': str(backend.root),
                'recommendation': (
                    'Use the in-memory backend when restart continuity is not required. For shared or durable '
                    'production sessions, prefer a database or shared cache backend when available.'
                ),
            },
        )

    return backend


def get_auth_session_backend() -> AuthSessionBackend:
    """Return the configured auth session backend."""

    from dara.core.internal.registries import utils_registry

    if not utils_registry.has(AUTH_SESSION_BACKEND_REGISTRY_KEY):
        raise RuntimeError('Auth session backend has not been configured')

    return utils_registry.get(AUTH_SESSION_BACKEND_REGISTRY_KEY)


def set_auth_session_backend(backend: AuthSessionBackend):
    """Set the auth session backend used by auth routes."""

    from dara.core.internal.registries import utils_registry

    utils_registry.set(AUTH_SESSION_BACKEND_REGISTRY_KEY, backend)
