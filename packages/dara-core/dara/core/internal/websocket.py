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

import math
import uuid
from typing import Dict, Optional, Tuple
from uuid import uuid4

import anyio
from anyio import Event, create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from fastapi import HTTPException, Query
from jwt import DecodeError
from starlette.websockets import WebSocket, WebSocketDisconnect

from dara.core.auth.definitions import AuthError, TokenData
from dara.core.auth.utils import decode_token
from dara.core.logging import eng_logger


class WebSocketHandler:
    """
    Represents a WebSocket connection to a given client.
    """

    channel_id: str
    """
    ID of the channel this handler is associated with.
    """

    send_stream: MemoryObjectSendStream
    """
    Stream for the application to send messages to the client.
    """

    receive_stream: MemoryObjectReceiveStream
    """
    Stream containing messages to send to the client.
    """

    pending_responses: Dict[str, Tuple[Event, Optional[dict]]] = {}
    """
    A map of pending responses from the client. The key is the message ID and the value is a tuple of the event to
    notify when the response is received and the response data.
    """

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, channel_id: str):
        send_stream, receive_stream = create_memory_object_stream(math.inf)
        self.channel_id = channel_id
        self.send_stream = send_stream
        self.receive_stream = receive_stream

    async def send_message(self, message: dict):
        """
        Send a message to the client.

        :param message: The message to send
        """
        await self.send_stream.send(message)

    async def process_client_message(self, message: dict):
        """
        Process a message received from the client.
        Handles resolving pending responses.

        :param message: The message to process
        """
        data = message.get('message')
        message_id = message.get('channel')

        # If the message has a channel ID, it's a response to a previous message
        if message_id:
            if message_id in self.pending_responses:
                event, _ = self.pending_responses[message_id]

                # Store the response and set the event to notify the waiting coroutine
                self.pending_responses[message_id] = (event, data)
                event.set()

    async def send_and_wait(self, message: dict) -> Optional[dict]:
        """
        Send a message to the client and return the client's response

        :param message: The message to send
        """
        message_id = str(uuid4())
        ev = Event()
        self.pending_responses[message_id] = (ev, None)
        message['__rchan'] = message_id
        await self.send_stream.send(message)

        # Wait for the response; this is done in chunks as otherwise Jupyter blocks the event loop
        while not ev.is_set():
            await anyio.sleep(0.01)

        pending_response = self.pending_responses.pop(message_id)

        if not pending_response:
            return None

        _, response_data = pending_response
        return response_data


class WebsocketManager:
    """
    Manages WebSocket connections to clients and communication with them.
    """

    def __init__(self):
        self.handlers: Dict[str, WebSocketHandler] = {}

    def create_handler(self, channel_id: str) -> WebSocketHandler:
        """
        Create and register a new WebSocketHandler for the given channel_id.

        :param channel_id: The channel ID to create a handler for
        """
        handler = WebSocketHandler(channel_id)
        self.handlers[channel_id] = handler
        return handler

    async def broadcast(self, message: dict):
        """
        Send a message to all connected clients.

        :param message: The message to send
        """
        for handler in self.handlers.values():
            await handler.send_message(message)

    async def send_message(self, channel_id: str, message: dict):
        """
        Send a message to the client associated with the given channel_id.

        :param channel_id: The channel ID to send the message to
        :param message: The message to send
        """
        handler = self.handlers.get(channel_id)
        if handler:
            await handler.send_message(message)

    async def send_and_wait(self, channel_id: str, message: dict):
        """
        Send a message to the client associated with the given channel_id and wait for a response.

        :param channel_id: The channel ID to send the message to
        :param message: The message to send
        """
        handler = self.handlers.get(channel_id)
        if handler:
            return await handler.send_and_wait(message)

    def remove_handler(self, channel_id: str):
        """
        Remove the WebSocketHandler associated with the given channel_id.

        :param channel_id: The channel ID to remove the handler for
        """
        if channel_id in self.handlers:
            del self.handlers[channel_id]


async def ws_handler(websocket: WebSocket, token: Optional[str] = Query(default=None)):
    """
    Websocket handler. Used for live_reloading in dev mode and for notifying the UI of task results.

    :param websocket: The websocket connection
    :param token: The authentication token
    """
    if token is None:
        raise HTTPException(403, 'Token missing from websocket connection query parameter')

    from dara.core.internal.registries import (
        pending_tokens_registry,
        sessions_registry,
        utils_registry,
        websocket_registry,
    )

    # Create a unique channel for this client connection
    channel = str(uuid.uuid4())

    try:
        token_content: TokenData = decode_token(token)
    except DecodeError:
        raise HTTPException(status_code=403, detail='Invalid or expired token')
    except AuthError as err:
        raise HTTPException(status_code=403, detail=err.detail)

    # Register once accepted - map session id to the channel so subsequent requests can identify the client
    websocket_registry.register(token_content.session_id, channel)

    # Remove from pending tokens if present
    if pending_tokens_registry.has(token):
        pending_tokens_registry.remove(token)

    user_identifier = token_content.identity_id or token_content.identity_name

    # Add the new session ID to known sessions for that user
    if sessions_registry.has(user_identifier):
        previous_sessions = sessions_registry.get(user_identifier)
        previous_sessions.add(token_content.session_id)
        sessions_registry.set(user_identifier, previous_sessions)
    else:
        sessions_registry.set(user_identifier, {token_content.session_id})

    # Change protocol from http to ws - from this point exceptions can't be raised
    await websocket.accept()

    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

    try:
        # Create a handler for this connection
        handler = ws_mgr.create_handler(channel)

        # Send the init message to tell the client it's channel
        await websocket.send_json({'type': 'init', 'message': {'channel': channel}})

        async with create_task_group() as tg:

            async def receive_from_client():
                """
                Handle messages received from the client and pass them to the handler
                """
                while True:
                    # Wait for incoming websocket messages and handle them appropriately
                    data = await websocket.receive_json()

                    # Heartbeat to keep connection alive
                    if data['type'] == 'ping':
                        await websocket.send_json({'type': 'pong', 'message': None})
                    # Incoming messages from the frontend
                    if data['type'] == 'message':
                        await handler.process_client_message(data)

            async def send_to_client():
                """
                Handle messages sent to the client and pass them via the websocket
                """
                async for message in handler.receive_stream:
                    if 'task_id' in message.keys() and 'status' in message.keys():
                        message = {key: message[key] for key in message if key != 'result'}
                    await websocket.send_json({'type': 'message', 'message': message})

            # Start the two tasks to handle sending and receiving messages
            tg.start_soon(receive_from_client)
            tg.start_soon(send_to_client)

    except WebSocketDisconnect:
        websocket_registry.remove(token_content.session_id)
        ws_mgr.remove_handler(channel)
        # Handle forceful disconnection caused by i.e. server reload in dev
        eng_logger.warning('Websocket forcefully disconnected')
