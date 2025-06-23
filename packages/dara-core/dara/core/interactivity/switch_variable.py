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

from __future__ import annotations

from typing import Any, Dict, Optional, Union

from pydantic import SerializerFunctionWrapHandler, field_validator, model_serializer

from dara.core.interactivity.condition import Condition
from dara.core.interactivity.non_data_variable import NonDataVariable


class SwitchVariable(NonDataVariable):
    """
    A SwitchVariable represents a conditional value that switches between
    different values based on a condition or variable value.

    SwitchVariable provides a clean way to create conditional logic in your
    application by mapping input values or conditions to output values. It
    supports boolean conditions, value mappings, and default fallbacks.

    There are three main patterns for creating SwitchVariables:

    1. **Boolean Conditions**: Switch between two values based on a true/false condition
    2. **Value Mapping**: Map specific input values to corresponding output values
    3. **Mixed Usage**: Combine conditions and mappings with default fallbacks

    Examples:
        Basic boolean switching:

        ```python
        from dara.core import Variable, SwitchVariable

        is_admin = Variable(default=False)

        # Show different UI based on admin status
        ui_mode = SwitchVariable.when(
            condition=is_admin,
            true_value='admin_panel',
            false_value='user_panel'
        )
        ```

        Value mapping with defaults:

        ```python
        user_role = Variable(default='guest')

        # Map user roles to permission levels
        permissions = SwitchVariable.match(
            value=user_role,
            mapping={
                'admin': 'full_access',
                'editor': 'write_access',
                'viewer': 'read_access'
            },
            default='no_access'  # for unknown roles
        )
        ```

        Complex conditions:

        ```python
        score = Variable(default=0)

        # Grade based on score ranges
        grade = SwitchVariable.when(
            condition=score >= 90,
            true_value='A',
            false_value='B'
        )

        # Or using mapping for cleaner multi-condition logic
        grade_mapping = SwitchVariable.match(
            value=score // 10,  # Convert score to tens digit
            mapping={
                10: 'A+', 9: 'A', 8: 'B', 7: 'C', 6: 'D'
            },
            default='F'
        )
        ```

        Switching on computed conditions:

        ```python
        temperature = Variable(default=20)

        # Weather advice based on temperature
        advice = SwitchVariable.when(
            condition=temperature > 25,
            true_value='Wear light clothes',
            false_value='Wear warm clothes'
        )
        ```

        Using with other variables:

        ```python
        user_preference = Variable(default='auto')
        mapping_variable = Variable({'auto': 'light', 'light': 'light_theme', 'dark': 'dark_theme'})

        # Theme selection with user preference override
        active_theme = SwitchVariable.match(
            value=user_preference,
            mapping=mapping_variable,
            default='light_theme'
        )
        ```

    Note:
        - All values (conditions, mappings, defaults) can be Variables, raw values, or Conditions
        - The switch evaluation happens reactively when underlying variables change
        - Default values are only used in mapping scenarios when the switch value
          doesn't match any key in the mapping
        
    Key Serialization:
        When using mappings with SwitchVariable, be aware that JavaScript object keys
        are always strings. The system automatically converts lookup keys to strings:
        - Python: {True: 'admin', False: 'user'} 
        - JavaScript: {"true": "admin", "false": "user"}
        - Boolean values are converted to lowercase strings ("true"/"false")
        - Other values use standard string conversion to match JavaScript's String() behavior
    """

    value: Optional[Union[Condition, NonDataVariable, Any]] = None
    # must be typed as any, otherwise pydantic is trying to instantiate the variables incorrectly
    value_map: Optional[Any] = None
    default: Optional[Any] = None

    def __init__(
        self,
        value: Union[Condition, NonDataVariable, Any],
        value_map: Dict[Any, Any] | NonDataVariable,
        default: Optional[Any] = None,
        uid: Optional[str] = None,
    ):
        """
        Create a SwitchVariable with a mapping of values.

        :value: Variable, condition, or value to switch on
        :value_map: Dict mapping switch values to return values
        :default: Default value when switch value not in mapping
        :uid: Unique identifier for this variable
        """
        super().__init__(
            uid=uid,
            value=value,
            value_map=value_map,
            default=default,
        )

    @field_validator('value_map')
    @classmethod
    def validate_value_map(cls, v):
        """Validate that value_map is either a dict or a NonDataVariable."""
        if v is None:
            return v
        if isinstance(v, dict):
            return v
        if isinstance(v, NonDataVariable):
            return v
        raise ValueError(f'value_map must be a dict or NonDataVariable, got {type(v)}')

    @classmethod
    def when(
        cls,
        condition: Union[Condition, NonDataVariable, Any],
        true_value: Union[Any, NonDataVariable],
        false_value: Union[Any, NonDataVariable],
        uid: Optional[str] = None,
    ) -> 'SwitchVariable':
        """
        Create a SwitchVariable for boolean conditions.

        This is the most common pattern for simple if/else logic. The condition
        is evaluated and returns true_value if truthy, false_value otherwise.

        Args:
            condition: Condition to evaluate (Variable, Condition object, or any value)
            true_value: Value to return when condition evaluates to True
            false_value: Value to return when condition evaluates to False
            uid: Unique identifier for this variable

        Returns:
            SwitchVariable configured for boolean switching

        Example:
            ```python
            is_loading = Variable(default=True)

            # Show spinner while loading, content when done
            display = SwitchVariable.condition(
                condition=is_loading,
                true_value='Loading...',
                false_value='Content loaded!'
            )
            ```
        """
        return cls(
            value=condition,
            value_map={True: true_value, False: false_value},
            uid=uid,
        )

    @classmethod
    def match(
        cls,
        value: Union[NonDataVariable, Any],
        mapping: Union[Dict[Any, Any], NonDataVariable],
        default: Optional[Union[Any, NonDataVariable]] = None,
        uid: Optional[str] = None,
    ) -> 'SwitchVariable':
        """
        Create a SwitchVariable with a custom mapping.

        This pattern is useful when you have multiple specific values to map to
        different outputs, similar to a switch statement in other languages.

        Args:
            value: Variable or value to switch on
            mapping: Dict mapping switch values to return values
            default: Default value when switch value not found in mapping
            uid: Unique identifier for this variable

        Returns:
            SwitchVariable configured with the provided mapping

        Example:
            ```python
            status = Variable(default='pending')

            # Map status codes to user-friendly messages
            message = SwitchVariable.match(
                value=status,
                mapping={
                    'pending': 'Please wait...',
                    'success': 'Operation completed!',
                    'error': 'Something went wrong',
                    'cancelled': 'Operation was cancelled'
                },
                default='Unknown status'
            )
            ```
        """
        return cls(
            value=value,
            value_map=mapping,
            default=default,
            uid=uid,
        )

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {**parent_dict, '__typename': 'SwitchVariable', 'uid': str(parent_dict['uid'])}
