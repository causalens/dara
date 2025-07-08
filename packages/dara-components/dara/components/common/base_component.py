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

from typing import Literal, Optional, Union

from pydantic import ConfigDict

from dara.core.definitions import ComponentInstance, StyledComponentInstance

JustifyContent = Literal[
    '-moz-initial',
    'center',
    'end',
    'flex-end',
    'flex-start',
    'inherit',
    'initial',
    'left',
    'normal',
    'revert',
    'right',
    'space-around',
    'space-between',
    'space-evenly',
    'start',
    'stretch',
    'unset',
    None,
]


class LayoutError(Exception):
    """An Error type for when the layout is invalid"""


class BaseDashboardComponent(StyledComponentInstance):
    """
    The base Component class for all other dashboarding components to extend from.
    """

    model_config = ConfigDict(extra='forbid', use_enum_values=True)

    # Define JS module on the base component so we don't have to repeat that on each component
    js_module = '@darajs/components'

    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        if len(args) > 0 and len(kwargs.get('children') or []) == 0:
            kwargs['children'] = list(arg for arg in args if arg is not None)

        # Fallback
        if 'children' not in kwargs:
            kwargs['children'] = []

        super().__init__(**kwargs)


class LayoutComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to aid in laying out a document should inherit from this class. It adds
    append/pop functionality that allows for these components to be created more dynamically (e.g. inside a loop)

    :param position: the position of the component, defaults to 'relative'
    :param justify: the justify-content value to be passed to the component
    :param align: the align-items value to be passed to the component
    """

    position: Union[str, None] = 'relative'

    justify: Optional[JustifyContent] = None

    def append(self, component: ComponentInstance):
        """
        Add a new component to the list of children, raises a TypeError if a the component does not inherit from
        BaseComponent

        :param component: the component to add, can be any type of BaseComponent
        """
        if ComponentInstance.isinstance(component) is False:
            name = self.__class__.__name__
            raise TypeError(f'You may only append other components to a {name} component. Not: {component}')
        self.children.append(component)  # type: ignore

    def pop(self):
        """
        Pops the last child from the list of children and returns it. Raises an IndexError if the parent is empty
        """
        if len(self.children) == 0:  # type: ignore
            raise IndexError(f'{self.__class__.__name__} is empty')
        return self.children.pop()  # type: ignore


class ContentComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to display content should inherit from this class. It makes sure that
    LayoutComponents cannot be nested inside. It also switches the alignment mode of the component to align self
    rather than aligning children.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        cmp_name = self.__class__.__name__
        if len(self.children) != 0:  # type: ignore
            for child in self.children:  # type: ignore
                if isinstance(child, LayoutComponent):
                    raise LayoutError(f'A {child.__class__.__name__} component cannot be nested inside a {cmp_name}')


class ModifierComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to modify the behavior of the nested component should inherit from this class.
    """


class InteractiveComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to provide an interaction point to the end user. e.g. inputs, dropdowns and
    buttons
    """


class FormComponent(InteractiveComponent):
    """
    A subset of InteractiveComponents which must subscribe to the Form context.
    """

    id: Optional[str] = None
