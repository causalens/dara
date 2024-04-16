"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

import mimetypes

from dara.core.http import post
from dara.components.smart.chat.config import ChatConfig
from dara.components.smart.chat.types import NewMessageBody

mimetypes.init()


@post(f'/chat/messages')
def on_new_message(chat_config: ChatConfig, body: NewMessageBody):
    return chat_config.on_new_message(body)
