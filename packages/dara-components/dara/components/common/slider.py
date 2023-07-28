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

from decimal import Decimal
from typing import Any, Dict, List, Optional, Union

from pydantic import validator

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import UrlVariable, Variable


class Slider(FormComponent):
    """
    ![Slider](../../../../docs/packages/dara-components/common/assets/Slider.png)

    A component to create a slider. The domain, ticks, stepping, rails and rail labels are controllable.
    The number of handles and their initial values are set via the number of values supplied. The value
    variable will update when handles are moved.

    A simple Slider component with a single handle that tracks the selected value over a given range is created via:

    ```python

    from dara.core import Variable
    from dara.components.common import Slider

    Slider(
        domain=[0.0, 1.0],
        value=Variable(0.5),
    )

    ```

    A more complex example with multiple handles, a set step size, specified ticks, a right hand rail and a track label
    is created via:

    ```python

    from dara.core import Variable
    from dara.components.common import Slider

    Slider(
        domain=[-10, 10],
        step=2,
        rail_from_start=False,
        rail_labels=['My Slider'],
        rail_to_end=True,
        ticks=[-9, -5, -1, 1, 5, 9],
        value=Variable([-3, 6, 8]),
    )

    ```

    Setting the disable_input_alternative to True removes the switch for changing the slider to a numerical input box:

    ```python

    from dara.core.definitions import Variable
    from dara.components.common import Slider

    Slider(
        domain=[0.0, 1.0],
        value=Variable(0.5),
        disable_input_alternative=True,
    )

    ```

    :param domain: The range of the slider
    :param onchange: Optional action to call on each slider update
    :param step: The step size of the slider
    :param rail_from_start:  Boolean, if True the track is rendered from leftmost handle to the end
    :param rail_labels: A label for the track
    :param rail_to_end: Boolean, if True the track is rendered from rightmost handle to the end
    :param ticks: List specifying the position of the ticks
    :param value: A Variable instance recording the component's state; can be a single number for single-handle Slider, or an N-length array for a Slider with N handles
    :param disable_input_alternative: Boolean, if True disable the rendering of the input alternative switch
    :param id: the key to be used if this component is within a form
    """

    domain: List[float]
    onchange: Optional[Action] = None
    step: Optional[float] = None
    rail_from_start: bool = True
    rail_labels: Optional[List[str]] = None
    rail_to_end: bool = False
    ticks: Optional[List[Union[float, int]]] = None
    value: Optional[Union[Variable[Any], UrlVariable[Any]]] = None
    disable_input_alternative: bool = False
    id: Optional[str] = None

    @validator('domain')
    @classmethod
    def domain_valid(cls, v: List[float]) -> List[float]:
        if len(v) != 2:
            raise ValueError(f'Domain must be a list of length two [min, max], found {v}')

        if v[1] <= v[0]:
            raise ValueError(f'Domain max value must be greater than the min value, found {v}')

        return v

    @validator('step')
    @classmethod
    def step_valid(cls, v: Optional[float], values: Dict[str, Any]) -> Optional[float]:
        if v is None:
            return v

        # both step and domain are set, make sure they are compatible
        # using Decimal to avoid floating point errors
        domain = values['domain']
        domain_range = Decimal(str(domain[1])) - Decimal(str(domain[0]))
        step = Decimal(str(v))

        # Not divisible
        if domain_range % step != 0:
            raise ValueError(
                f'Step {v} is not compatible with domain {domain}. The domain range must be divisible by the step provided.'
            )

        return v
