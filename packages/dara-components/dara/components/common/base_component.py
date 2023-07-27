"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from dara.core.definitions import ComponentInstance, StyledComponentInstance


class LayoutError(Exception):
    """An Error type for when the layout is invalid"""


class BaseDashboardComponent(StyledComponentInstance):
    """
    The base Component class for all other dashboarding components to extend from.
    """

    # Define JS module on the base component so we don't have to repeat that on each component
    js_module = '@darajs/components'

    class Config:
        smart_union = True
        extra = 'forbid'
        use_enum_values = True

    def __init__(self, *args: ComponentInstance, **kwargs):
        super().__init__(children=list(args), **kwargs)


class LayoutComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to aid in laying out a document should inherit from this class. It adds
    append/pop functionality that allows for these components to be created more dynamically (e.g. inside a loop)
    """

    position: str = 'relative'

    def append(self, component: ComponentInstance):
        """
        Add a new component to the list of children, raises a TypeError if a the component does not inherit from
        BaseComponent

        :param component: the component to add, can be any type of BaseComponent
        """
        if isinstance(component, ComponentInstance) is False:
            name = self.__class__.__name__
            raise TypeError(f'You may only append other components to a {name} component. Not: {component}')
        self.children.append(component)   # type: ignore

    def pop(self):
        """
        Pops the last child from the list of children and returns it. Raises an IndexError if the parent is empty
        """
        if len(self.children) == 0:   # type: ignore
            raise IndexError(f'{self.__class__.__name__} is empty')
        return self.children.pop()   # type: ignore


class ContentComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to display content should inherit from this class. It makes sure that
    LayoutComponents cannot be nested inside. It also switches the alignment mode of the component to align self
    rather than aligning children.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        cmp_name = self.__class__.__name__
        if len(self.children) != 0:   # type: ignore
            for child in self.children:   # type: ignore # pylint: disable=not-an-iterable
                if isinstance(child, LayoutComponent):
                    raise LayoutError(f'A {child.__class__.__name__} component cannot be nested inside a {cmp_name}')


class ModifierComponent(BaseDashboardComponent):
    """
    Any component that's primary role is to modify the behaviour of the nested component should inherit from this class.
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
