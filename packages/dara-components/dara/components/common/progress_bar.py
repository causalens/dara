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

from typing import Optional, Union

from pydantic import field_validator

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import ClientVariable


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

    progress: Union[int, ClientVariable]
    small: bool = False
    color: Optional[str] = None

    @field_validator('progress')
    @classmethod
    def validate_progress(cls, progress):
        if not isinstance(progress, (int, ClientVariable)):
            raise ValueError('Progress must be an int or Variable')
        return progress
