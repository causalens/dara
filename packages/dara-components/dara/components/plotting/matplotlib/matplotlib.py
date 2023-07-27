"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
