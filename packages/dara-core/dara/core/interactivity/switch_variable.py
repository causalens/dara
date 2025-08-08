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

from dara.core.interactivity.client_variable import ClientVariable
from dara.core.interactivity.condition import Condition


class SwitchVariable(ClientVariable):
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
        from dara.core import ConfigurationBuilder, Variable, SwitchVariable
        from dara.components import Stack, Text, Button, Card

        config = ConfigurationBuilder()
        is_admin = Variable(default=False)

        # Show different UI based on admin status
        ui_mode = SwitchVariable.when(
            condition=is_admin,
            true_value='Admin Panel',
            false_value='User Panel'
        )

        # Complete component usage
        page_content = Card(
            Stack(
                Text('Current Mode:'),
                Text(text=ui_mode),
                Button('Toggle Admin', onclick=is_admin.toggle())
            ),
            title='Admin Panel Demo'
        )

        config.add_page('Admin Demo', content=page_content)
        ```

        Value mapping with defaults:

        ```python
        from dara.core import ConfigurationBuilder, Variable, SwitchVariable
        from dara.components import Stack, Text, Select, Item, Card

        config = ConfigurationBuilder()
        user_role = Variable(default='guest')

        # Map user roles to permission levels
        permissions = SwitchVariable.match(
            value=user_role,
            mapping={
                'admin': 'Full Access',
                'editor': 'Write Access',
                'viewer': 'Read Access'
            },
            default='No Access'  # for unknown roles
        )

        # Complete component usage
        page_content = Card(
            Stack(
                Text('Select Role:'),
                Select(
                    value=user_role,
                    items=[
                        Item(label='Guest', value='guest'),
                        Item(label='Viewer', value='viewer'),
                        Item(label='Editor', value='editor'),
                        Item(label='Admin', value='admin')
                    ]
                ),
                Text('Permissions:'),
                Text(text=permissions)
            ),
            title='Role Permissions'
        )

        config.add_page('Permissions Demo', content=page_content)
        ```

        Complex conditions:

        ```python
        from dara.core import Variable, SwitchVariable
        from dara.components import Stack, Text, Input, Card

        score = Variable(default=85)

        # Grade based on score ranges
        grade = SwitchVariable.when(
            condition=score >= 90,
            true_value='A Grade',
            false_value='B Grade'
        )

        # Complete component usage
        grade_component = Card(
            Stack(
                Text('Enter Score:'),
                Input(value=score, type='number'),
                Text('Grade (>=90 = A, <90 = B):'),
                Text(text=grade)
            ),
            title='Grade Calculator'
        )
        ```

        Switching on computed conditions:

        ```python
        from dara.core import Variable, SwitchVariable
        from dara.components import Stack, Text, Input, Card

        temperature = Variable(default=20)

        # Weather advice based on temperature
        advice = SwitchVariable.when(
            condition=temperature > 25,
            true_value='Wear light clothes - it\'s warm!',
            false_value='Wear warm clothes - it\'s cool!'
        )

        # Complete component usage
        weather_app = Card(
            Stack(
                Text('Temperature (°C):'),
                Input(value=temperature, type='number'),
                Text('Advice:'),
                Text(text=advice)
            ),
            title='Weather Advisor'
        )
        ```

        Using with other variables:

        ```python
        from dara.core import Variable, SwitchVariable
        from dara.components import Stack, Text, Select, Item, Card

        user_preference = Variable(default='auto')
        mapping_variable = Variable({
            'auto': 'System Theme',
            'light': 'Light Theme',
            'dark': 'Dark Theme'
        })

        # Theme selection with user preference override
        active_theme = SwitchVariable.match(
            value=user_preference,
            mapping=mapping_variable,
            default='Default Theme'
        )

        # Complete component usage
        theme_selector = Card(
            Stack(
                Text('Theme Preference:'),
                Select(
                    value=user_preference,
                    items=[
                        Item(label='Auto', value='auto'),
                        Item(label='Light', value='light'),
                        Item(label='Dark', value='dark')
                    ]
                ),
                Text('Active Theme:'),
                Text(text=active_theme)
            ),
            title='Theme Selector'
        )
        ```

    Note:
        - Value can be a condition, raw value, or variable
        - Value map can be a variable or a dict
        - Default can be a variable or a raw value
        - The switch evaluation happens reactively when underlying variables change
        - Default values are only used in mapping scenarios when the switch value
          doesn't match any key in the mapping

    Key Serialization:
        When using mappings with SwitchVariable, be aware that JavaScript object keys
        are always strings. The system automatically converts lookup keys to strings:
        - Python: `{True: 'admin', False: 'user'}`
        - JavaScript: `{"true": "admin", "false": "user"}`
        - Boolean values are converted to lowercase strings ("true"/"false")
        - Other values use standard string conversion to match JavaScript's String() behavior
    """

    value: Optional[Union[Condition, ClientVariable, Any]] = None
    # must be typed as any, otherwise pydantic is trying to instantiate the variables incorrectly
    value_map: Optional[Any] = None
    default: Optional[Any] = None

    def __init__(
        self,
        value: Union[Condition, ClientVariable, Any],
        value_map: Dict[Any, Any] | ClientVariable,
        default: Optional[Any] = None,
        uid: Optional[str] = None,
    ):
        """
        Create a SwitchVariable with a mapping of values.

        :param value: Variable, condition, or value to switch on
        :param value_map: Dict mapping switch values to return values
        :param default: Default value when switch value not in mapping
        :param uid: Unique identifier for this variable
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
        """
        Validate that value_map is either a dict or a ClientVariable.

        :param v: The value to validate
        :return: The validated value
        :raises ValueError: If value_map is not a dict or ClientVariable
        """
        if v is None:
            return v
        if isinstance(v, dict):
            return v
        if isinstance(v, ClientVariable):
            return v
        raise ValueError(f'value_map must be a dict or ClientVariable, got {type(v)}')

    @classmethod
    def when(
        cls,
        condition: Union[Condition, ClientVariable, Any],
        true_value: Union[Any, ClientVariable],
        false_value: Union[Any, ClientVariable],
        uid: Optional[str] = None,
    ) -> SwitchVariable:
        """
        Create a SwitchVariable for boolean conditions.

        This is the most common pattern for simple if/else logic. The condition
        is evaluated and returns true_value if truthy, false_value otherwise.

        :param condition: Condition to evaluate (Variable, Condition object, or any value)
        :param true_value: Value to return when condition evaluates to True
        :param false_value: Value to return when condition evaluates to False
        :param uid: Unique identifier for this variable
        :return: SwitchVariable configured for boolean switching

        Example with variable condition:
            ```python
            from dara.core import Variable, SwitchVariable
            from dara.components import Stack, Text, Button

            is_loading = Variable(default=True)

            # Show spinner while loading, content when done
            display = SwitchVariable.when(
                condition=is_loading,
                true_value='Loading...',
                false_value='Content loaded!'
            )

            # Use in a complete component
            page_content = Stack(
                Text(text=display),
                Button(
                    text='Toggle Loading',
                    onclick=is_loading.toggle()
                )
            )
            ```

            Example with a condition object:

            ```python
            from dara.core import Variable, SwitchVariable
            from dara.components import Stack, Text, Input, Card

            # Temperature-based clothing advice
            temperature = Variable(default=20)
            advice = SwitchVariable.when(
                condition=temperature > 25,
                true_value='Wear light clothes - it\'s warm!',
                false_value='Wear warm clothes - it\'s cool!'
            )

            # Complete weather advice component
            weather_component = Card(
                Stack(
                    Text('Enter temperature (°C):'),
                    Input(value=temperature, type='number'),
                    Text('Advice:'),
                    Text(text=advice)
                ),
                title='Weather Advice'
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
        value: Union[ClientVariable, Any],
        mapping: Union[Dict[Any, Any], ClientVariable],
        default: Optional[Union[Any, ClientVariable]] = None,
        uid: Optional[str] = None,
    ) -> SwitchVariable:
        """
        Create a SwitchVariable with a custom mapping.

        This pattern is useful when you have multiple specific values to map to
        different outputs, similar to a switch statement in other languages.

        :param value: Variable or value to switch on
        :param mapping: Dict mapping switch values to return values
        :param default: Default value when switch value not found in mapping
        :param uid: Unique identifier for this variable
        :return: SwitchVariable configured with the provided mapping

        Example:
            ```python
            from dara.core import Variable, SwitchVariable
            from dara.components import Stack, Text, Select, Item

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

            # Use in a complete component
            page_content = Stack(
                Select(
                    value=status,
                    items=[
                        Item(label='Pending', value='pending'),
                        Item(label='Success', value='success'),
                        Item(label='Error', value='error'),
                        Item(label='Cancelled', value='cancelled')
                    ]
                ),
                Text(text=message)
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
        """
        Serialize the SwitchVariable model with additional metadata.

        :param nxt: The next serializer function in the chain
        :return: Serialized dictionary with __typename and uid fields
        """
        parent_dict = nxt(self)
        return {**parent_dict, '__typename': 'SwitchVariable', 'uid': str(parent_dict['uid'])}
