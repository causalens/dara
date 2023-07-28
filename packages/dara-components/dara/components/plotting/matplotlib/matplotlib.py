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

from base64 import b64encode
from io import BytesIO

from matplotlib.figure import Figure

from dara.core.definitions import StyledComponentInstance


class Matplotlib(StyledComponentInstance):
    """
    A Matplotlib Component allows for a matplotlib figure to be added to your app.
    This component converts the figure to a base64 encoded string and passes it to
    the frontend where it is displayed as an image.

    Although matplotlib plots can usually be made with pyplot, this is not
    thread-safe and so should not be used. Instead, use the matplotlib figure object.

    :param figure: A matplotlib figure
    """

    js_module = '@darajs/components'

    figure: str

    def __init__(
        self,
        figure: Figure,
        **kwargs,
    ):
        # Check if the figure is a matplotlib figure, they shouldn't be allowed to pass pyplot as that is not thread-safe
        if not isinstance(figure, Figure):
            raise TypeError('figure must be of type matplotlib figure')

        buffer = BytesIO()
        figure.savefig(buffer, format='svg')
        # Reset the buffer's position to the start
        buffer.seek(0)

        image_base64 = b64encode(buffer.read()).decode('utf-8')

        super().__init__(figure=image_base64, **kwargs)
