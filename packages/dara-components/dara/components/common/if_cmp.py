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

from typing import ClassVar, List, Optional, Union

from pydantic import field_validator

from dara.components.common.base_component import ModifierComponent
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import AnyVariable, Condition, Operator


def cast_list(value: Union[ComponentInstance, List[Union[ComponentInstance, None]]]) -> List[ComponentInstance]:
    """
    Cast the value to a list if it is not or return original list if it is.

    :param value: the value to cast
    """
    return [v for v in value if v is not None] if isinstance(value, List) else [value]


ConditionType = type[Condition]


class If(ModifierComponent):
    """
    The If component allows the subsequent children to be rendered based on a condition that will be evaluated at
    runtime in the JS code. Conditions are defined with a Condition object, which can be defined manually or by using a
    normal comparison operator on a Variable instance, e.g. Variable() == True. The component then accepts one required
    set of children and one optional set. The required children (passed as a single child or array for multiple) will be
    rendered if the condition is truthy and the optional second set will be rendered if the condition is falsey.

    An If component is created like so, in this example it is comparing the values of two variables:

    ```python
    from dara.core import Variable
    from dara.components.common import If, Text

    var_1 = Variable(True)
    var_2 = Variable(False)

    If(
        condition=var_1 == var_2,
        true_children=Text('Equal'),
        false_children=Text('Different')
    )
    ```

    :param condition: a condition object
    :param true_children: children to display when the condition is met
    :param false_children: children to display when the condition is not met, defaults to nothing rendered if not passed
    """

    condition: Condition
    true_children: List[ComponentInstance]
    false_children: List[ComponentInstance]

    Condition: ClassVar[ConditionType] = Condition

    @field_validator('condition')
    @classmethod
    def validate_condition(cls, value):
        if not isinstance(value, Condition):
            raise ValueError(
                'Your condition did not evaluate to a condition object. Comparing to a Variable will '
                'automatically create a condition object for you. Using is as the comparator will not '
                "work as there is no way to override it's behavior. If you are using an is condition "
                'then replace it with == or define the Condition object yourself.'
            )
        return value

    def __init__(
        self,
        condition: Union[Condition, AnyVariable],  # type: ignore
        true_children: Union[ComponentInstance, List[Union[ComponentInstance, None]]],
        false_children: Optional[Union[ComponentInstance, List[Union[ComponentInstance, None]]]] = None,
    ):
        if false_children is None:
            false_children = []
        if isinstance(condition, AnyVariable):
            condition = Condition(operator=Operator.TRUTHY, other=None, variable=condition)

        super().__init__(
            condition=condition,
            true_children=cast_list(true_children),
            false_children=cast_list(false_children),  # type: ignore
        )
