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

from typing import Optional

from pydantic import validator

from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity import AnyVariable
from dara.core.visual.components.types import Direction

ForDef = JsComponentDef(name='For', js_module='@darajs/core', py_module='dara.core')


class For(ComponentInstance):
    """
    The For component is a special component designed to handle rendering
    of templated components created using the `@template` decorator. It accepts a
    template component and a data source, then dynamically renders the template
    component for each item in the data source.

    The For component is ideal for situations where you need to generate a list
    of components based on data, such as rendering a list of cards. It is particularly useful
    for improving performance when rendering large lists of components.

    Supports virtualization, which is enabled by default. Virtualization is a technique
    that only renders the components that are visible on the screen which can significantly improve performance when rendering
    large lists of components.

    Virtualized example:

    ```
    from dara.core import template, For, Variable
    from dara_dashboarding_extension import Card, Heading, Text, Button, If, Stack

    var = Variable([
        {'title': 'Experiment 1', 'description': 'Description 1', 'button_text': 'Run 1', 'button_color': 'red', 'size': 200},
        {'title': 'Experiment 2', 'description': 'Description 2', 'button_text': 'Run 2', 'button_color': 'blue', 'extra': 'Extra text', 'size': 300},
        ...
    ])

    @template
    def ExperimentCard(template_var: template.Value):
        return Card(
            Heading(template_var.title, level=2),
            Text(template_var.description),
            # Conditionally render the extra field if it exists
            If(template_var.extra, Text(template_var.extra)),
            Button(template_var.button_text, raw_css={'backgroundColor': template_var.button_color}),
            ...
        )

    Stack(
        For(
            key_accessor='title',
            data=var,
            template=ExperimentCard(),
            size_accessor='size' # Use the 'size' field to determine the height of each rendered component
        )
    )
    ```

    In this example the For component will render an ExperimentCard for each item in the 'var' data source,
    with the appropriate data injected into the template component. The 'title' field is used here as the
    `key_accessor`, this works here because the title is unique for each item; in general it is recommended
    to use a unique identifier for the `key_accessor` such as an `id` field. Note how the `size_accessor` is
    used to determine the height of each rendered component, this is required for virtualization to work correctly.

    Non-virtualized example:

    ```
    from dara.core import template, For, Variable
    from dara_dashboarding_extension import Card, Heading, Text, Button, Stack

    var = Variable([
        {'title': 'Experiment 1', 'description': 'Description 1', 'button_text': 'Run 1', 'button_color': 'red'},
        {'title': 'Experiment 2', 'description': 'Description 2', 'button_text': 'Run 2', 'button_color': 'blue'},
        ...
    ])

    @template
    def ExperimentCard(template_var: template.Value):
        return Card(
            Heading(template_var.title, level=2),
            Text(template_var.description),
            Button(template_var.button_text, raw_css={'backgroundColor': template_var.button_color}),
            ...
        )

    Stack(
        For(
            key_accessor='title',
            data=var,
            template=ExperimentCard(),
            virtualize=False
        ),
        scroll=True
    )
    ```


    :param data: The variable containing the data to iterate over. Should be a list of dictionaries when serialized, DataVariables are handled out-of-the-box.
    :param template: Templated component, created by `@template`, to render for each item in the variable.
    :param key_accessor: a string representing a property name in the data item, which will be used as the unique identifier for each rendered
    component. Must be unique for each item in the data source or else changes in data will not be correctly reflected in the rendered components.
    :param size_accessor: a string representing a property name in the data item which will be used as the size of each rendered component. The property must
    be a pixel size number (e.g. 100, 200, 300, etc). This is required when `virtualize=True` in order to correctly render the virtualized list. This corresponds
    to item height in the vertical direction and item width in the horizontal direction.
    :param virtualize: whether or not to use virtualization. Defaults to True. When virtualization is enabled, only the visible items are rendered, which can
    improve performance when rendering large lists of components. Requires `size_accessor` to be set if `True`.
    """

    data: AnyVariable
    template: ComponentInstance
    key_accessor: str
    size_accessor: Optional[str] = None
    direction: Direction = Direction.VERTICAL
    virtualize: bool = True

    @validator('template')
    @classmethod
    def is_templated_component(cls, v: ComponentInstance):
        if not v.templated:
            raise ValueError(
                '`For.template` must be a templated component. Make sure to use `@template` decorator to create a templated component'
            )
        return v

    @validator('size_accessor')
    @classmethod
    def require_size_accessor_if_virtualize(cls, v: Optional[str], values: dict):
        if v is None and values['virtualize']:
            raise ValueError(
                '`For.size_accessor` is required when `virtualize=True` in order to correctly render the virtualized list. Please provide a `size_accessor` or set `virtualize=False` to opt out of virtualization.'
            )
        return v
