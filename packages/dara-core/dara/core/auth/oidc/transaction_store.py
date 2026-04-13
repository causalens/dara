from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock

from .definitions import OIDCLoginTransaction
from .settings import get_oidc_settings


@dataclass
class _TransactionEntry:
    transaction: OIDCLoginTransaction
    expires_at: datetime


class OIDCTransactionStore:
    """
    In-memory OIDC login transaction store keyed by opaque state values.

    Transactions are single-use and pruned lazily on reads/writes.
    """

    def __init__(self):
        self._entries: OrderedDict[str, _TransactionEntry] = OrderedDict()
        self._lock = Lock()

    def _limits(self) -> tuple[int, int]:
        settings = get_oidc_settings()
        return settings.transaction_ttl_seconds, settings.transaction_max_entries

    def _prune_expired_locked(self, now: datetime):
        expired = [state for state, entry in self._entries.items() if entry.expires_at <= now]
        for state in expired:
            self._entries.pop(state, None)

    def set(self, transaction: OIDCLoginTransaction):
        now = datetime.now(tz=timezone.utc)
        ttl_seconds, max_entries = self._limits()
        expires_at = now + timedelta(seconds=ttl_seconds)

        with self._lock:
            self._prune_expired_locked(now)
            self._entries[transaction.state] = _TransactionEntry(transaction=transaction, expires_at=expires_at)
            self._entries.move_to_end(transaction.state)

            while len(self._entries) > max_entries:
                self._entries.popitem(last=False)

    def take(self, state: str) -> OIDCLoginTransaction | None:
        now = datetime.now(tz=timezone.utc)

        with self._lock:
            self._prune_expired_locked(now)
            entry = self._entries.pop(state, None)
            if entry is None:
                return None
            return entry.transaction

    def bind_login_session(self, state: str, login_session_id: str) -> OIDCLoginTransaction | None:
        now = datetime.now(tz=timezone.utc)

        with self._lock:
            self._prune_expired_locked(now)
            entry = self._entries.get(state)
            if entry is None:
                return None

            updated = entry.transaction.model_copy(update={'login_session_id': login_session_id})
            entry.transaction = updated
            self._entries.move_to_end(state)
            return updated

    def get(self, state: str) -> OIDCLoginTransaction | None:
        now = datetime.now(tz=timezone.utc)

        with self._lock:
            self._prune_expired_locked(now)
            entry = self._entries.get(state)
            if entry is None:
                return None
            return entry.transaction

    def clear(self):
        with self._lock:
            self._entries.clear()


oidc_transaction_store = OIDCTransactionStore()
