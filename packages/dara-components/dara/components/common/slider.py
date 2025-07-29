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

from decimal import ROUND_FLOOR, Decimal
from typing import Any, List, Optional, Union

from pydantic import Field, ValidationInfo, field_validator

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import Variable


def compute_step(difference: Decimal) -> Decimal:
    """
    Compute what step should be used for the given domain difference.

    The step is computed as:
      step = 10^(floor(log10(difference))) / 10

    For cases where the step is a decimal (i.e. when the log10 is negative),
    the result is quantized to a fixed number of decimal places to avoid
    floating point imprecision.

    :param difference: The domain difference (must be positive).
    :return: The computed step.
    """
    if difference <= 0:
        raise ValueError('difference must be a positive Decimal.')

    # Compute the base-10 logarithm of the difference
    log_value = difference.log10()
    # Get the integer part via floor
    log_int = int(log_value.to_integral_value(rounding=ROUND_FLOOR))

    # Compute 10^(floor(log10(difference))) / 10
    step = (Decimal(10) ** log_int) / Decimal(10)

    # If the logarithm is negative, quantize the step to prevent
    # precision errors. The precision is set to abs(log_int) + 1 decimal places.
    if log_int < 0:
        num_decimals = abs(log_int) + 1
        quantizer = Decimal(f'1e-{num_decimals}')
        step = step.quantize(quantizer)

    return step


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

    value_var = Variable(0.5)

    Slider(
        domain=[0.0, 1.0],
        value=value_var,
    )
    ```

    A more complex example with multiple handles, a set step size, specified ticks, a right hand rail and a track label
    is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Slider

    value_var = Variable([-3, 6, 8])

    Slider(
        domain=[-10, 10],
        step=2,
        rail_from_start=False,
        rail_labels=['My Slider'],
        rail_to_end=True,
        ticks=[-9, -5, -1, 1, 5, 9],
        value=value_var,
    )
    ```

    Setting the disable_input_alternative to True removes the switch for changing the slider to a numerical input box:

    ```python
    from dara.core.definitions import Variable
    from dara.components.common import Slider

    value_var = Variable(0.5)

    Slider(
        domain=[0.0, 1.0],
        value=value_var,
        disable_input_alternative=True,
    )
    ```

    :param domain: The range of the slider
    :param onchange: Optional action to call on each slider update
    :param step: The step size of the slider
    :param rail_from_start:  Boolean, if True the track is rendered from leftmost handle to the end
    :param rail_labels: A label for the track
    :param rail_to_end: Boolean, if True the track is rendered from rightmost handle to the end
    :param thumb_labels: A list of labels for the slider's thumbs
    :param ticks: List specifying the position of the ticks
    :param value: A Variable instance recording the component's state; can be a single number for single-handle Slider, or an N-length array for a Slider with N handles
    :param disable_input_alternative: Boolean, if True disable the rendering of the input alternative switch
    :param id: the key to be used if this component is within a form
    """

    domain: List[float]
    onchange: Optional[Action] = None
    step: Optional[float] = Field(None, validate_default=True)
    rail_from_start: bool = True
    rail_labels: Optional[List[str]] = None
    rail_to_end: bool = False
    thumb_labels: Optional[List[str]] = None
    ticks: Optional[List[Union[float, int]]] = None
    value: Optional[Variable[Any]] = None
    disable_input_alternative: bool = False
    id: Optional[str] = None

    @field_validator('domain')
    @classmethod
    def domain_valid(cls, v: List[float]) -> List[float]:
        if len(v) != 2:
            raise ValueError(f'Domain must be a list of length two [min, max], found {v}')

        if v[1] <= v[0]:
            raise ValueError(f'Domain max value must be greater than the min value, found {v}')

        return v

    @field_validator('step')
    @classmethod
    def step_valid(cls, v: Optional[float], info: ValidationInfo) -> Optional[float]:
        # domain validation must have failed, skip
        if 'domain' not in info.data:
            return v

        # make sure step and domain are compatible
        # using Decimal to avoid floating point errors
        domain = info.data['domain']
        domain_range = Decimal(str(domain[1])) - Decimal(str(domain[0]))

        # If step is not provided, run inference to check if the
        # client-side computed step is compatible with the domain range.
        # The actual step is computed in the client-side but we check it here to fail early.
        step = compute_step(domain_range) if v is None else Decimal(str(v))

        # Not divisible
        if domain_range % step != 0:
            step_string = f'Step {step}'
            if v is None:
                step_string += ' (inferred from domain range)'
            raise ValueError(
                f'{step_string} is not compatible with domain {domain}. The domain range must be divisible by the step.'
            )

        return v
