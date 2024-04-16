"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from dara.core.definitions import EndpointConfiguration
from dara.core.logging import dev_logger
from typing import Callable
from dara.components.smart.chat.types import NewMessageBody


class ChatConfig(EndpointConfiguration):
    """
    Chat configuration object.

    :param on_new_message: Callback function to be called when a new message is sent in the chat
    """

    on_new_message: Callable[[NewMessageBody], None]

    @classmethod
    def default(cls):
        dev_logger.warning('Using default configuration for ChatConfig. Please provide a valid configuration.')
        return cls(on_new_message=lambda _: None)
