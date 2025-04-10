"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from typing import List, Optional

from dara.core.base_definitions import DaraBaseModel as BaseModel


class ChatUserData(BaseModel):
    """
    Describes the shape of the data for a user

    :param identity_id: ID of user's identity
    :param identity_name: name of user's identity
    :param identity_email: email of user's identity
    :param groups: list of groups user belongs to
    """

    id: Optional[str] = None
    name: str
    email: Optional[str] = None


class ChatMessage(BaseModel):
    """
    Describes the shape of the data for a message

    :param id: ID of the chat message
    :param message: the message content
    :param created_at: the time the message was created
    :param updated_at: the time the message was updated
    :param user: the user who created the message
    """

    id: str
    message: str
    created_at: str
    updated_at: str
    user: ChatUserData


class NewMessageBody(BaseModel):
    """
    Describes the shape of the data for a message

    :param app_url: the url of the chat app
    :param user: a list of users that have been participated in that chat
    :param content: the new message info
    """

    app_url: str
    users: List[ChatUserData]
    content: ChatMessage
