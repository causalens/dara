"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

import sys
import traceback
from contextlib import contextmanager
from datetime import datetime
from typing import TYPE_CHECKING

from dara.core.internal.websocket import WebsocketManager

if TYPE_CHECKING:
    from dara.core.internal.message_bus import MessageBus

from dara.core.logging import eng_logger


def print_stacktrace():
    """
    Prints out the current stack trace. Will also extract any exceptions and print them at the end.
    """
    exc = sys.exc_info()[0]
    stack = traceback.extract_stack()[:-1]

    trc = 'Traceback (most recent call last):\n'
    stackstr = trc + ''.join(traceback.format_list(stack))
    if exc is not None:
        stackstr += '  ' + traceback.format_exc().lstrip(trc)   # pylint:disable=bad-str-strip-call
    else:
        stackstr += '   Exception'

    return stackstr


@contextmanager
def handle_system_exit(error_msg: str):
    """
    Simple wrapper which makes sure crashes causing a SystemExit (i.e. through `exit(1)`) are properly propagated as errors
    """

    try:
        yield
    except SystemExit as e:
        raise InterruptedError(error_msg).with_traceback(e.__traceback__)


def get_error_for_channel() -> dict:
    """
    Get error from current stacktrace to send to the client
    """
    return {'error': print_stacktrace(), 'time': str(datetime.now())}


async def send_error_for_session(ws_mgr: WebsocketManager, session_id: str):
    """
    Broadcast error from current stacktrace to the correct client
    """
    if session_id:
        from dara.core.internal.registries import websocket_registry

        try:
            ws_channel = websocket_registry.get(session_id)

            if ws_channel:
                await ws_mgr.send_message(ws_channel, get_error_for_channel())
        except KeyError:
            eng_logger.warning('No ws_channel found for session', {'session_id': session_id})
