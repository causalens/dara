"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from dara.core.definitions import EndpointConfiguration
from dara.core.logging import dev_logger
from dara.components.smart.chat.chat_interface import ChatInterface


class ChatConfig(EndpointConfiguration):
    """
    Chat configuration object.
    """

    interface: ChatInterface
