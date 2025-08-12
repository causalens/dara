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

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import jwt
from anyio import to_thread

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


def decode_token(token: str, **kwargs) -> TokenData:
    """
    Decode a JWT token

    :param token: the JWT token to decode
    :param kwargs: additional arguments to pass to the jwt.decode function
    """
    try:
        return TokenData.parse_obj(jwt.decode(token, get_settings().jwt_secret, algorithms=[JWT_ALGO], **kwargs))
    except jwt.ExpiredSignatureError as e:
        raise AuthError(code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.DecodeError as e:
        raise AuthError(code=401, detail=INVALID_TOKEN_ERROR) from e


def sign_jwt(
    identity_id: str,
    identity_name: str,
    identity_email: Optional[str],
    groups: List[str],
    id_token: Optional[str] = None,
    exp: Optional[Union[datetime, int]] = None,
    session_id: Optional[str] = None,
):
    """
    Create a new Dara JWT token
    """
    if session_id is None:
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
        ).model_dump(),
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


class AsyncTokenRefreshCache:
    """
    An asynchronous cache for token refresh operations that handles concurrent requests
    and provides time-based cache invalidation.

    This cache is designed to prevent multiple simultaneous refresh attempts with the
    same refresh token, while also providing a short-term cache to reduce unnecessary
    token refreshes from multiple tabs/windows.
    """

    def __init__(self, ttl_seconds: int = 5):
        self.cache: Dict[str, Tuple[Any, datetime]] = {}
        self.locks: Dict[str, asyncio.Lock] = {}
        self.locks_lock = asyncio.Lock()
        self.ttl = timedelta(seconds=ttl_seconds)

    async def _get_or_create_lock(self, key: str) -> asyncio.Lock:
        """
        Get an existing lock for the given key or create a new one if it doesn't exist.

        This method is thread-safe and ensures that only one lock exists per key.

        :param key: The key to get or create a lock for.
        """

        async with self.locks_lock:
            if key not in self.locks:
                self.locks[key] = asyncio.Lock()
            return self.locks[key]

    def _cleanup_old_entries(self):
        """
        Remove expired entries from both the cache and locks dictionaries.

        This method is called before each cache access to prevent memory leaks
        from accumulated expired entries.
        """
        current_time = datetime.now()
        expired_keys = [key for key, (_, timestamp) in self.cache.items() if current_time - timestamp > self.ttl]
        for key in expired_keys:
            self.cache.pop(key, None)
            # We can modify self.locks here because we're always under an async lock when calling this
            self.locks.pop(key, None)

    def get_cached_value(self, key: str) -> Tuple[Any, bool]:
        """
        Retrieve a value from the cache if it exists and hasn't expired.

        :param key: The key to retrieve from the cache.
        :return: A tuple containing the value and a boolean indicating whether the value was found.
        """
        self._cleanup_old_entries()
        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp <= self.ttl:
                return value, True
        return None, False

    def set_cached_value(self, key: str, value: Any):
        """
        Set a value in the cache with the current timestamp.

        :param key: The key to set in the cache.
        :param value: The value to set in the cache.
        """
        self.cache[key] = (value, datetime.now())

    def clear(self):
        """
        Clear the cache and locks dictionaries.
        """
        self.cache.clear()
        self.locks.clear()


token_refresh_cache = AsyncTokenRefreshCache(ttl_seconds=5)
"""
Shared token refresh cache instance
"""


async def cached_refresh_token(
    do_refresh_token: Callable[[TokenData, str], Tuple[str, str]], old_token_data: TokenData, refresh_token: str
):
    """
    A utility to run a token refresh method with caching to prevent multiple concurrent refreshes
    and short-term caching to reduce unnecessary refreshes from multiple tabs/windows.

    :param do_refresh_token: The function to perform the token refresh
    :param old_token_data: The old token data
    :param refresh_token: The refresh token to use
    """
    cache_key = refresh_token

    # check for cache hit
    cached_result, found = token_refresh_cache.get_cached_value(cache_key)
    if found:
        return cached_result

    # cache miss, acquire lock so only one call for given refresh_token is allowed
    lock = await token_refresh_cache._get_or_create_lock(cache_key)

    async with lock:
        # check cache again in case another call already refreshed the token while we were waiting
        cached_result, found = token_refresh_cache.get_cached_value(cache_key)
        if found:
            return cached_result

        # Run the refresh function
        result = await to_thread.run_sync(do_refresh_token, old_token_data, refresh_token)

        # update cache
        token_refresh_cache.set_cached_value(cache_key, result)

        return result
