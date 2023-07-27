"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional, Union

from pydantic import validator

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import NonDataVariable


class ProgressBar(ContentComponent):
    """
    ![ProgressBar](../../../../docs/packages/dara-components/common/assets/ProgressBar.png)

    A Progress Bar component is the basic component for showing a progress bar. It accepts the progress
    in percentage and display it. The progress should be a number between 0 and 100.

    A ProgressBar component can be created like so:

    ```python

    from dara.core import Variable
    from dara.components.common import ProgressBar

    ProgressBar(
        progress=Variable(20)
    )

    ```

    :param progress: The progress to be shown in percentage.
    :param small: Optional flag for showing the progress bar as a smaller strip.
    :param color: Optional color property for the progress bar, this should be the hex value of the color.
    """

    progress: Union[int, NonDataVariable]
    small: bool = False
    color: Optional[str] = None

    @validator('progress')
    @classmethod
    def validate_progress(cls, progress):
        if not isinstance(progress, (int, NonDataVariable)):
            raise ValueError('Progress must be an int or Variable')
        return progress
