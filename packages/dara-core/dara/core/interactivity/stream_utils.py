import asyncio
import contextlib
import signal
from collections.abc import AsyncGenerator, Callable
from typing import Any

from dara.core.logging import dev_logger

# Global set to track active connections
_active_connections: set[asyncio.Task] = set()
_shutdown_event = asyncio.Event()
_original_sigint_handler: Any | None = None
_original_sigterm_handler: Any | None = None


def _chained_signal_handler(signum, frame):
    dev_logger.info(f'[dara-core] Shutting down {len(_active_connections)} streaming connections...')
    _shutdown_event.set()

    # Cancel all active streaming connections immediately
    cancelled_count = 0
    for task in _active_connections.copy():
        if not task.done():
            task.cancel()
            cancelled_count += 1

    if cancelled_count > 0:
        dev_logger.info(f'[dara-core] Cancelled {cancelled_count} streaming connections')

    # Call the original handler if it exists and isn't the default
    original_handler = _original_sigint_handler if signum == signal.SIGINT else _original_sigterm_handler

    if original_handler and original_handler != signal.SIG_DFL and callable(original_handler):
        original_handler(signum, frame)


def setup_signal_handlers():
    """Setup signal handlers that chain with existing ones."""
    global _original_sigint_handler, _original_sigterm_handler

    # Save existing handlers
    _original_sigint_handler = signal.signal(signal.SIGINT, signal.SIG_DFL)
    _original_sigterm_handler = signal.signal(signal.SIGTERM, signal.SIG_DFL)

    # Install our chained handlers - only if they're not already installed
    if _original_sigint_handler is not _chained_signal_handler:
        signal.signal(signal.SIGINT, _chained_signal_handler)

    if _original_sigterm_handler is not _chained_signal_handler:
        signal.signal(signal.SIGTERM, _chained_signal_handler)


def track_stream(func: Callable[[], AsyncGenerator[Any, None]]):
    """
    Decorator to track active streaming connections.
    Keeps track of the current task in active_connections while it's live.
    """

    async def wrapper():
        current_task = asyncio.current_task()
        assert current_task is not None, 'No current task found'
        _active_connections.add(current_task)

        try:
            # The tracked wrapper is the iterator consumed by StreamingResponse.
            # Own the wrapped generator explicitly so closing the HTTP-facing
            # iterator while suspended at yield propagates teardown immediately.
            async with contextlib.aclosing(func()) as stream:
                async for item in stream:
                    yield item
        finally:
            _active_connections.discard(current_task)

    return wrapper
