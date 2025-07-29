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

from datetime import datetime
from typing import Any, Optional

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import Variable


class Datepicker(FormComponent):
    """
    ![Datepicker](../../../../docs/packages/dara-components/common/assets/Datepicker.png)

    A component for selecting a date from a calendar. The passed value must be a Variable instance and will
    be updated with the underlying value when a date is selected. Also optionally takes min/max dates allowed
    values, a date format string, whether to close the component when a date is selected, if time should
    be shown and whether to allow a range selection.

    The values coming out of from Datepicker are always a string in ISO format, in the user's local timezone.

    A single Datepicker component that tracks the chosen value is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Datepicker

    date_var = Variable()

    Datepicker(
        value=date_var
    )
    ```

    A Datepicker component that allows to choose between a date range is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Datepicker

    date_var = Variable()

    Datepicker(
        value=date_var,
        range=True,
    )
    ```

    A more complicated example with an initial date, has a custom
    format, and does not close on selection is created via:

    ```python
    from datetime import datetime
    from dara.core import Variable
    from dara.components.common import Datepicker

    date_var = Variable(datetime(2021, 9, 18))

    Datepicker(
        value=date_var,
        date_format='MM/dd/yyyy',
        enable_time=True,
        max_date=datetime(2023, 12, 21),
        min_date=datetime(2020, 3, 20),
        select_close=False,
    ),
    ```

    :param value: A Variable with the initial date value
    :param date_format: A string specifying the format in which to display the date to the user, it does not affect the return value.
        The format it understands follows that defined by [date-fns](https://date-fns.org/v2.29.3/docs/format)
    :param enable_time: Boolean, if True display the time
    :param max_date: An optional value specifying the maximum date
    :param min_date: An optional value specifying the minimum date
    :param range: Boolean, if True then the datepicker will allow a date range to be selected
    :param select_close: Boolean, if True then close when a date has been selected
    :param onchange: Action triggered when the selected datetime has changed
    :param id: the key to be used if this component is within a form
    """

    value: Optional[Variable[Any]] = None
    date_format: str = 'dd/MM/yyyy'
    enable_time: bool = False
    max_date: Optional[datetime] = None
    min_date: Optional[datetime] = None
    range: bool = False
    select_close: bool = True
    onchange: Optional[Action] = None
    id: Optional[str] = None
