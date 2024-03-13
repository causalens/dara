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

from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import NonDataVariable


class Chat(StyledComponentInstance):
    """
    A Chat component which can be added anywhere in your page. When added a chat button will appear in the bottom right
    of your page and when clicked a chat sidebar will appear. This can be added on a page by page basis, with the chat
    state being store in a Variable.

    If you would like for the Variable's state to be persistent between restarts, and shared across multiple app users,
    you can use a BackendStore with your prefered backend. For example, to store the chat messages in a json file, you
    can use the FileBackend, as showcased below:

    ```python
    from dara.core import Variable, ConfigurationBuilder
    from dara.core.auth import MultiBasicAuthConfig
    from dara.core.persistence import BackendStore, FileBackend
    from dara.components import Stack, Text, Chat

    # Create a variable to store the chat messages in a json file, so that they are persisted between restarts
    collab_variable = Variable(store=BackendStore(uid='my_variable', backend=FileBackend(path='my_chat.json')))

    # Create an auth configuration with two users
    config = ConfigurationBuilder()
    config.add_auth(MultiBasicAuthConfig(users={'user': 'password', 'user2': 'password2'}))

    # Add a page with a chat component, this can be added anywhere within a page
    config.add_page(
        name='Chat Page',
        content=Stack(
            Text('This is a page with a chat'),
            Chat(value=collab_variable),
        ),
    )
    ```

    :param value: A Variable which stores the chat's state
    """

    js_module = '@darajs/components'

    value: NonDataVariable

    class Config:
        extra = 'forbid'
