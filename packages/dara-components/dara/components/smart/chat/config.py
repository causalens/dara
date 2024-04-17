"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from typing import Callable

from dara.components.smart.chat.types import NewMessageBody
from dara.core.definitions import EndpointConfiguration


class ChatConfig(EndpointConfiguration):
    """
    Chat configuration object.

    :param on_new_message: Callback function to be called when a new message is sent in the chat
    """

    on_new_message: Callable[[NewMessageBody], None]

    @classmethod
    def default(cls):
        return cls(on_new_message=lambda _: None)
