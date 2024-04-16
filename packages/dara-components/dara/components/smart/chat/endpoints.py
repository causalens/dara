"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from dara.components.smart.chat.config import ChatConfig
from dara.components.smart.chat.types import NewMessageBody
from dara.core.http import post
from dara.core.internal.utils import run_user_handler


@post('/chat/messages')
async def on_new_message(chat_config: ChatConfig, body: NewMessageBody):
    return await run_user_handler(chat_config.on_new_message, args=[body])
