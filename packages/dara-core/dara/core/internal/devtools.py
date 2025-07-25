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

from __future__ import annotations

import sys
import traceback
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

from dara.core.internal.websocket import WebsocketManager
from dara.core.logging import eng_logger


def print_stacktrace(err: Optional[BaseException] = None) -> str:
    """
    Prints out the current stack trace. Will also extract any exceptions and print them at the end.
    """
    if err is not None:
        return ''.join(traceback.format_exception(type(err), err, err.__traceback__))

    exc = sys.exc_info()[0]
    stack = traceback.extract_stack()[:-1]

    trc = 'Traceback (most recent call last):\n'
    stackstr = trc + ''.join(traceback.format_list(stack))
    if exc is not None:
        stackstr += '  ' + traceback.format_exc().lstrip(trc)
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
        raise InterruptedError(error_msg) from e


def get_error_for_channel(err: Optional[BaseException] = None) -> dict:
    """
    Get error from current stacktrace to send to the client
    """
    return {
        'error': print_stacktrace(err),
        'time': str(datetime.now()),
    }


async def send_error_for_session(ws_mgr: WebsocketManager, session_id: str):
    """
    Broadcast error from current stacktrace to the correct client
    """
    if session_id:
        from dara.core.internal.registries import websocket_registry

        try:
            ws_channels = websocket_registry.get(session_id)

            if ws_channels:
                for ws_channel in ws_channels:
                    await ws_mgr.send_message(ws_channel, message=get_error_for_channel())
        except KeyError:
            eng_logger.warning('No ws_channel found for session', {'session_id': session_id})
