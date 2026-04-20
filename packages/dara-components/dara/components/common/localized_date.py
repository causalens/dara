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

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import ClientVariable


class LocalizedDate(ContentComponent):
    """
    A LocalizedDate component renders an ISO date string formatted in the user's
    local timezone. Formatting follows [date-fns](https://date-fns.org/docs/format) tokens.

    When `date` is empty or cannot be parsed, `placeholder` is rendered instead and
    `data-state="error"` is set on the wrapper so the error state can be targeted via
    `raw_css`.

    A LocalizedDate component can be created like so:

    ```python

    from dara.core import Variable
    from dara.components.common import LocalizedDate

    LocalizedDate(date='2024-01-15T14:30:00Z')

    LocalizedDate(
        date=Variable('2024-01-15T14:30:00Z'),
        format='dd/MM/yyyy HH:mm',
        placeholder='N/A',
        raw_css='&[data-state="error"] { color: red; }',
    )

    ```

    :param date: The date to display, as an ISO string or a Variable resolving to one
    :param format: The date-fns format string, defaults to 'yyyy-MM-dd HH:mm'
    :param placeholder: Value shown when the date is missing or cannot be parsed, defaults to an empty string
    """

    date: str | ClientVariable
    format: str | ClientVariable = 'yyyy-MM-dd HH:mm'
    placeholder: str | ClientVariable = ''

    def __init__(self, date: str | ClientVariable, **kwargs):
        super().__init__(date=date, **kwargs)
