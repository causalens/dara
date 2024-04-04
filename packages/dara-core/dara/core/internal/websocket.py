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
from contextvars import ContextVar
from typing import Any, Dict, Literal, Optional, Set, Tuple, Union
from uuid import uuid4

import anyio
from anyio import Event, create_memory_object_stream, create_task_group
from anyio.streams.memory import MemoryObjectReceiveStream, MemoryObjectSendStream
from exceptiongroup import catch
from fastapi import HTTPException, Query
from fastapi.encoders import jsonable_encoder
from jwt import DecodeError
from pydantic import BaseModel, Field, parse_obj_as
from starlette.websockets import WebSocket, WebSocketDisconnect

from dara.core.auth.definitions import AuthError, TokenData
from dara.core.auth.utils import decode_token
from dara.core.logging import dev_logger, eng_logger


# Client message types
class DaraClientMessage(BaseModel):
    """
    Represents a message sent by Dara internals from the frontend to the backend.

    An optional chunk_count field can be used to indicate that a message is chunked and what number of messages to expect
    """

    type: Literal['message'] = Field(default='message', const=True)
    channel: str
    chunk_count: Optional[int] = None
    message: Any


class CustomClientMessagePayload(BaseModel):
    kind: str
    data: Any


class CustomClientMessage(BaseModel):
    """
    Represents a custom message sent by the frontend to the backend.
    """

    type: Literal['custom'] = Field(default='custom', const=True)
    message: CustomClientMessagePayload


ClientMessage = Union[DaraClientMessage, CustomClientMessage]

# Server message types
class ServerMessagePayload(BaseModel):
    rchan: Optional[str] = Field(default=None, alias='__rchan')
    """Return channel if the message is expected to have a response for"""

    class Config:
        extra = 'allow'

    def dict(self, *args, **kwargs):
        # Force by_alias to True to use __rchan name
        result = super().dict(*args, **{**kwargs, 'by_alias': True})

        # remove rchan if None
        if '__rchan' in result and result.get('__rchan') is None:
            result.pop('__rchan')

        return result


class CustomServerMessagePayload(ServerMessagePayload):
    kind: str
    data: Any


class DaraServerMessage(BaseModel):
    """
    Represents a message sent by Dara internals from the backend to the frontend.
    """

    type: Literal['message'] = Field(default='message', const=True)
    message: ServerMessagePayload   # exact messages expected by frontend are defined in js/api/websocket.tsx


class CustomServerMessage(BaseModel):
    """
    Represents a custom message sent by the backend to the frontend.
    """

    type: Literal['custom'] = Field(default='custom', const=True)
    message: CustomServerMessagePayload


ServerPayload = Union[ServerMessagePayload, CustomServerMessagePayload]
LoosePayload = Union[ServerPayload, dict]
ServerMessage = Union[DaraServerMessage, CustomServerMessage]

WS_CHANNEL: ContextVar[Optional[str]] = ContextVar('ws_channel', default=None)


class WebSocketHandler:
    """
    Represents a WebSocket connection to a given client.
    """

    channel_id: str
    """
    ID of the channel this handler is associated with.
    """

    send_stream: MemoryObjectSendStream[ServerMessage]
    """
    Stream for the application to send messages to the client.
    """

    receive_stream: MemoryObjectReceiveStream[ServerMessage]
    """
    Stream containing messages to send to the client.
    """

    pending_responses: Dict[str, Tuple[Event, Optional[Any]]]
    """
    A map of pending responses from the client. The key is the message ID and the value is a tuple of the event to
    notify when the response is received and the response data.
    """

    class Config:
        arbitrary_types_allowed = True

    def __init__(self, channel_id: str):
        send_stream, receive_stream = create_memory_object_stream[ServerMessage](math.inf)
        self.channel_id = channel_id
        self.send_stream = send_stream
        self.receive_stream = receive_stream
        self.pending_responses = {}

    async def send_message(self, message: ServerMessage):
        """
        Send a message to the client.

        :param message: The message to send
        """
        await self.send_stream.send(message)

    async def process_client_message(self, message: ClientMessage):
        """
        Process a message received from the client.
        Handles resolving pending responses.

        :param message: The message to process
        """
        if message.type == 'message':
            message_id = message.channel

            # If the message has a channel ID, it's a response to a previous message
            if message_id:
                if message_id in self.pending_responses:
                    event, existing_messages = self.pending_responses[message_id]

                    # If the response is chunked then collect the messages in pending responses
                    if message.chunk_count is not None:
                        if existing_messages is not None and isinstance(existing_messages, list):
                            existing_messages.append(message.message)
                        else:
                            existing_messages = [message.message]
                            self.pending_responses[message_id] = (event, existing_messages)

                        # If all chunks have been received, set the event to notify the waiting coroutine
                        if len(existing_messages) == message.chunk_count:
                            event.set()
                    else:
                        # Store the response and set the event to notify the waiting coroutine
                        self.pending_responses[message_id] = (event, message.message)
                        event.set()

        if message.type == 'custom':
            # import required internals
            from dara.core.internal.registries import custom_ws_handlers_registry
            from dara.core.internal.utils import run_user_handler

            data = message.message.data
            kind = message.message.kind

            try:
                handler = custom_ws_handlers_registry.get(kind)
                response = await run_user_handler(handler, args=(self.channel_id, data))

                # If the handler returns a response, send it to the client
                if response is not None:
                    await self.send_message(
                        CustomServerMessage(message=CustomServerMessagePayload(kind=kind, data=response))
                    )
            except KeyError as e:
                eng_logger.error(f'No handler found for custom message kind {kind}', e)
                return

    async def send_and_wait(self, message: ServerMessage) -> Optional[Any]:
        """
        Send a message to the client and return the client's response

        :param message: The message to send
        """
        message_id = str(uuid4())
        ev = Event()
        self.pending_responses[message_id] = (ev, None)
        message.message.rchan = message_id
        await self.send_stream.send(message)

        # Wait for the response; this is done in chunks as otherwise Jupyter blocks the event loop
        while not ev.is_set():
            await anyio.sleep(0.01)

        pending_response = self.pending_responses.pop(message_id)
        if not pending_response:
            return None

        _, response_data = pending_response
        return response_data


def get_user_channels(user_identifier: str) -> Set[str]:
    """
    Get connected websocket channels associated with a given user.

    :param user_identifier: The user identifier to get channels for
    """
    from dara.core.internal.registries import sessions_registry, websocket_registry

    if sessions_registry.has(user_identifier):
        user_sessions = sessions_registry.get(user_identifier)

        channels: Set[str] = set()
        for session_id in user_sessions:
            if websocket_registry.has(session_id):
                channels |= websocket_registry.get(session_id)

        return channels

    return set()


class WebsocketManager:
    """
    Manages WebSocket connections to clients and communication with them.
    """

    def __init__(self):
        self.handlers: Dict[str, WebSocketHandler] = {}

    def _construct_message(self, payload: LoosePayload, custom: bool) -> ServerMessage:
        """
        Construct a message to send to the client.

        :param payload: The payload to send
        :param custom: Whether the message is a custom message
        """
        if custom:
            return CustomServerMessage(message=CustomServerMessagePayload.parse_obj(payload))
        else:
            return DaraServerMessage(message=ServerMessagePayload.parse_obj(payload))

    def create_handler(self, channel_id: str) -> WebSocketHandler:
        """
        Create and register a new WebSocketHandler for the given channel_id.

        :param channel_id: The channel ID to create a handler for
        """
        handler = WebSocketHandler(channel_id)
        self.handlers[channel_id] = handler
        return handler

    async def broadcast(self, message: LoosePayload, custom=False):
        """
        Send a message to all connected clients.

        :param message: The message to send
        :param custom: Whether the message is a custom message
        """
        async with anyio.create_task_group() as tg:
            for handler in self.handlers.values():
                tg.start_soon(handler.send_message, self._construct_message(message, custom))

    async def send_message_to_user(self, user_id: str, message: LoosePayload, custom=False):
        """
        Send a message to all connected channels associated with the given user.

        :param user_id: The user ID to send the message to
        :param message: The message payload to send
        :param custom: Whether the message is a custom message
        """
        channels = get_user_channels(user_id)

        if len(channels) == 0:
            return

        async with anyio.create_task_group() as tg:
            for channel in channels:
                tg.start_soon(self.send_message, channel, message, custom)

    async def send_message(self, channel_id: str, message: LoosePayload, custom=False):
        """
        Send a message to the client associated with the given channel_id.

        :param channel_id: The channel ID to send the message to
        :param message: The message payload to send
        :param custom: Whether the message is a custom message
        """
        handler = self.handlers.get(channel_id)
        if handler:
            await handler.send_message(self._construct_message(message, custom))

    async def send_and_wait(self, channel_id: str, message: LoosePayload, custom=False):
        """
        Send a message to the client associated with the given channel_id and wait for a response.

        :param channel_id: The channel ID to send the message to
        :param message: The message to send
        :param custom: Whether the message is a custom message
        """
        handler = self.handlers.get(channel_id)
        if handler:
            return await handler.send_and_wait(self._construct_message(message, custom))

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

    from dara.core.auth.definitions import ID_TOKEN, SESSION_ID, USER, UserData
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
    if websocket_registry.has(token_content.session_id):
        previous_channels = websocket_registry.get(token_content.session_id)
        previous_channels.add(channel)
        websocket_registry.set(token_content.session_id, previous_channels)
    else:
        websocket_registry.set(token_content.session_id, {channel})

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

    # Set Auth context vars for the WS connection
    USER.set(
        UserData(
            identity_id=token_content.identity_id,
            identity_name=token_content.identity_name,
            identity_email=token_content.identity_email,
            groups=token_content.groups,
        )
    )
    SESSION_ID.set(token_content.session_id)
    ID_TOKEN.set(token_content.id_token)

    # Change protocol from http to ws - from this point exceptions can't be raised
    await websocket.accept()

    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

    with catch(
        {
            WebSocketDisconnect: lambda _: eng_logger.warning('Websocket disconnected'),
            BaseException: lambda e: dev_logger.error('Error in websocket handler', error=Exception(e)),
        }
    ):
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
                    # Wait for incoming websocket messages and handle them appropriately
                    while True:
                        # Note: this must be a while:true rather than a for-await
                        # as the latter does not properly handle disconnections e.g. when relaoading the server
                        data = await websocket.receive_json()

                        # Heartbeat to keep connection alive
                        if data['type'] == 'ping':
                            await websocket.send_json({'type': 'pong', 'message': None})
                        else:
                            try:
                                parsed_data = parse_obj_as(ClientMessage, data)
                                # Process the message in a separate task group to avoid blocking the receive task
                                tg.start_soon(handler.process_client_message, parsed_data)
                            except Exception as e:
                                eng_logger.error('Error processing client WS message', error=e)

                async def send_to_client():
                    """
                    Handle messages sent to the client and pass them via the websocket
                    """
                    async for message in handler.receive_stream:
                        if (
                            message.type == 'message'
                            and isinstance(message.message, ServerMessagePayload)
                            and getattr(message.message, 'task_id', None) is not None
                            and getattr(message.message, 'status', None)
                        ):
                            data = message.message
                            # Reconstruct the payload without the result field
                            message.message = ServerMessagePayload(
                                **{k: v for k, v in data.dict().items() if k != 'result'}
                            )
                        await websocket.send_json(jsonable_encoder(message))

                # Start the two tasks to handle sending and receiving messages
                tg.start_soon(receive_from_client)
                tg.start_soon(send_to_client)
        finally:
            if websocket_registry.has(token_content.session_id):
                channels = websocket_registry.get(token_content.session_id)
                if channel in channels:
                    channels.remove(channel)
                    websocket_registry.set(token_content.session_id, channels)
            ws_mgr.remove_handler(channel)
