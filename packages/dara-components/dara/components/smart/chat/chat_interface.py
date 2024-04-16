"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

import abc

from pydantic import BaseModel
from dara.components.smart.chat.types import NewMessageBody


class ChatInterface(abc.ABC, BaseModel):
    def __init__(self, **kwargs):
        """
        Initialize the chat interface
        """
        super().__init__(**kwargs)

    @abc.abstractmethod
    def on_new_message(self, payload: NewMessageBody):
        """
        Sends a notification with the new message sent to the chat
        """
