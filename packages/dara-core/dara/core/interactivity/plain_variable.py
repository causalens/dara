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

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable, Generic, List, Optional, TypeVar

from fastapi.encoders import jsonable_encoder
from pydantic import (
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    field_serializer,
    model_serializer,
)

from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.non_data_variable import NonDataVariable
from dara.core.internal.utils import call_async
from dara.core.logging import dev_logger
from dara.core.persistence import PersistenceStore

VARIABLE_INIT_OVERRIDE = ContextVar[Optional[Callable[[dict], dict]]]('VARIABLE_INIT_OVERRIDE', default=None)

VariableType = TypeVar('VariableType')
PersistenceStoreType_co = TypeVar('PersistenceStoreType_co', bound=PersistenceStore, covariant=True)


# TODO: once Python supports a default value for a generic type properly we can make PersistenceStoreType a second generic param
class Variable(NonDataVariable, Generic[VariableType]):
    """
    A Variable represents a dynamic value in the system that can be read and written to by components and actions
    """

    default: Optional[VariableType] = None
    persist_value: bool = False
    store: Optional[PersistenceStore] = None
    uid: str
    nested: List[str] = Field(default_factory=list)
    model_config = ConfigDict(extra='forbid')

    def __init__(
        self,
        default: Optional[VariableType] = None,
        persist_value: Optional[bool] = False,
        uid: Optional[str] = None,
        store: Optional[PersistenceStoreType_co] = None,
        nested: Optional[List[str]] = None,
    ):
        """
        A Variable represents a dynamic value in the system that can be read and written to by components and actions

        :param default: the initial value for the variable, defaults to None
        :param persist_value: whether to persist the variable value across page reloads
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        :param store: a persistence store to attach to the variable; modifies where the source of truth for the variable is
        """
        if nested is None:
            nested = []
        kwargs = {'default': default, 'persist_value': persist_value, 'uid': uid, 'store': store, 'nested': nested}

        # If an override is active, run the kwargs through it
        override = VARIABLE_INIT_OVERRIDE.get()
        if override is not None:
            kwargs = override(kwargs)

        if kwargs.get('store') is not None and kwargs.get('persist_value'):
            # TODO: this is temporary, persist_value will eventually become a type of store
            raise ValueError('Cannot provide a Variable with both a store and persist_value set to True')

        super().__init__(**kwargs)  # type: ignore

        if self.store:
            call_async(self.store.init, self)

    @field_serializer('default', mode='wrap')
    def serialize_default(self, default: Any, nxt: SerializerFunctionWrapHandler):
        """
        Handle serializing the default value of the Variable using the registry of encoders.
        This ensures that users can define a serializer with config.add_encoder and it will be used
        when serializing the Variable.default.
        """
        from dara.core.internal.encoder_registry import get_jsonable_encoder

        try:
            return jsonable_encoder(default, custom_encoder=get_jsonable_encoder())
        except Exception as e:
            dev_logger.error(
                f'Error serializing default value of Variable {self.uid}, falling back to default serialization',
                error=e,
            )

        return nxt(default)

    @staticmethod
    @contextmanager
    def init_override(override: Callable[[dict], dict]):
        """
        Override the init function of all Variables created within the context of this function.

        ```python
        with Variable.init_override(lambda kwargs: {**kwargs, 'persist_value': True}):
            var = Variable()
        ```

        :param override: a function that takes a dict of kwargs and returns a modified dict of kwargs
        """
        token = VARIABLE_INIT_OVERRIDE.set(override)
        yield
        VARIABLE_INIT_OVERRIDE.reset(token)

    def get(self, key: str):
        """
        Create a copy of this Variable that points to a nested key. This is useful when
        storing e.g. a dictionary in a Variable and wanting to access a specific key.

        ```python
        from dara.core import Variable, UpdateVariable
        from dara_dashboarding_extension import Input, Text, Stack, Button

        state = Variable({
            'input_value': 'Text',
            'settings': {
                'language': 'English'
            }
        })

        page_content = Stack(
            # Only `input_value` will be displayed
            Text(text=state.get('input_value')),

            # Only the specified property will be updated
            Input(value=state.get('input_value')),

            # You can chain the `get` calls to specify a sub-property to use
            Input(value=state.get('settings').get('language')),

            # You can also use the `UpdateVariable` action to update a sub-property
            Button(
                'Set Language to German',
                onclick=UpdateVariable(lambda _: 'German', variable=state.get('settings').get('language')
            )
        )

        :param key: the key to access; must be a string
        ```
        """
        return self.model_copy(update={'nested': [*self.nested, key]}, deep=True)

    def sync(self):
        """
        Create an action to synchronise the value of this Variable with input value sent from the component.

        ```python

        from dara.core import Variable
        from dara.components import Select

        var = Variable('first')
        another_var = Variable()

        Select(
            value=var,
            items=['first', 'second', 'third'],
            # syncing value to `another_var` in addition to `var`
            onchange=another_var.sync(),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=UpdateVariableImpl.INPUT)

    def toggle(self):
        """
        Create an action to toggle the value of this Variable. Note this only works for boolean variables.

        ```python

        from dara.core import Variable
        from dara.components import Button

        var = Variable(True)

        Button(
            'Toggle',
            onclick=var.toggle(),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=UpdateVariableImpl.TOGGLE)

    def update(self, value: Any):
        """
        Create an action to update the value of this Variable to a provided value.

        ```python

        from dara.core import Variable
        from dara.components import Button

        show = Variable(True)

        Button(
            'Hide',
            onclick=var.update(False),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=value)

    @classmethod
    def create_from_derived(cls, other: DerivedVariable):
        """
        Create a Variable instance from a DerivedVariable.
        The Variable will be initialised with the current value of the DerivedVariable but will still be mutable afterwards.

        :param default: the initial value for the variable, defaults to None
        """
        if isinstance(other, DerivedDataVariable):
            raise ValueError(
                'Cannot create a Variable from a DerivedDataVariable, only standard DerivedVariables are allowed'
            )

        return cls(default=other)  # type: ignore

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)

        return {**parent_dict, '__typename': 'Variable', 'uid': str(parent_dict['uid'])}
