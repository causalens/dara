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

import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone

import anyio

from .settings import get_oidc_settings


@dataclass
class _CacheEntry:
    id_token: str
    hard_expires_at: float
    idle_expires_at: float


class OIDCIdTokenCache:
    """
    In-memory cache for OIDC id_tokens keyed by Dara session_id.

    Entries are evicted on whichever comes first:
    - hard expiry: token `exp` claim
    - idle expiry: sliding TTL refreshed on reads/writes
    The cache is also bounded by max_entries with LRU eviction.
    """

    def __init__(self):
        self._entries: OrderedDict[str, _CacheEntry] = OrderedDict()
        self._lock = anyio.Lock()

    def _limits(self) -> tuple[int, int]:
        settings = get_oidc_settings()
        return settings.id_token_cache_idle_ttl_seconds, settings.id_token_cache_max_entries

    @staticmethod
    def _to_timestamp(exp: datetime | int | float) -> float:
        if isinstance(exp, datetime):
            if exp.tzinfo is None:
                return exp.replace(tzinfo=timezone.utc).timestamp()
            return exp.timestamp()
        return float(exp)

    def _prune_expired_locked(self, now: float):
        expired = [
            session_id
            for session_id, entry in self._entries.items()
            if entry.hard_expires_at <= now or entry.idle_expires_at <= now
        ]
        for session_id in expired:
            self._entries.pop(session_id, None)

    async def set(self, session_id: str, id_token: str, exp: datetime | int | float):
        now = time.time()
        hard_expires_at = self._to_timestamp(exp)

        async with self._lock:
            self._prune_expired_locked(now)

            if hard_expires_at <= now:
                self._entries.pop(session_id, None)
                return

            idle_ttl_seconds, max_entries = self._limits()
            idle_expires_at = min(hard_expires_at, now + idle_ttl_seconds)

            self._entries[session_id] = _CacheEntry(
                id_token=id_token,
                hard_expires_at=hard_expires_at,
                idle_expires_at=idle_expires_at,
            )
            self._entries.move_to_end(session_id)

            while len(self._entries) > max_entries:
                self._entries.popitem(last=False)

    async def get(self, session_id: str, *, touch: bool = True) -> str | None:
        now = time.time()

        async with self._lock:
            self._prune_expired_locked(now)

            entry = self._entries.get(session_id)
            if entry is None:
                return None

            if touch:
                idle_ttl_seconds, _ = self._limits()
                entry.idle_expires_at = min(entry.hard_expires_at, now + idle_ttl_seconds)
                self._entries.move_to_end(session_id)

            return entry.id_token

    async def has(self, session_id: str) -> bool:
        return await self.get(session_id, touch=False) is not None

    async def remove(self, session_id: str):
        async with self._lock:
            self._entries.pop(session_id, None)

    async def clear(self):
        async with self._lock:
            self._entries.clear()


oidc_id_token_cache = OIDCIdTokenCache()
