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

import json

import pytest

from dara.core import DerivedVariable, StateVariable, Variable


def test_derived_variable_is_loading_property():
    """Test that DerivedVariable.is_loading returns a StateVariable with correct properties."""

    def dummy_func(x):
        return x * 2

    dv = DerivedVariable(dummy_func, variables=[Variable(5)])
    loading_var = dv.is_loading

    assert isinstance(loading_var, StateVariable)
    assert loading_var.parent_variable == dv
    assert loading_var.property_name == 'loading'
    assert loading_var.uid is not None

    # check serialization
    serialized = loading_var.model_dump()
    dv_serialized = dv.model_dump()

    serialized_parent = serialized['parent_variable']
    assert json.dumps(serialized_parent) == json.dumps(dv_serialized)


def test_derived_variable_has_error_property():
    """Test that DerivedVariable.has_error returns a StateVariable with correct properties."""

    def dummy_func(x):
        return x * 2

    dv = DerivedVariable(dummy_func, variables=[])
    error_var = dv.has_error

    assert isinstance(error_var, StateVariable)
    assert error_var.parent_variable == dv
    assert error_var.property_name == 'error'
    assert error_var.uid is not None


def test_derived_variable_has_value_property():
    """Test that DerivedVariable.has_value returns a StateVariable with correct properties."""

    def dummy_func(x):
        return x * 2

    dv = DerivedVariable(dummy_func, variables=[])
    value_var = dv.has_value

    assert isinstance(value_var, StateVariable)
    assert value_var.parent_variable == dv
    assert value_var.property_name == 'hasValue'
    assert value_var.uid is not None


def test_state_variable_serialization():
    """Test that StateVariable serializes correctly."""

    def dummy_func(x):
        return x * 2

    dv = DerivedVariable(dummy_func, variables=[])
    loading_var = dv.is_loading

    serialized = loading_var.model_dump()

    assert serialized['__typename'] == 'StateVariable'
    assert 'uid' in serialized
    assert 'parent_variable' in serialized
    assert serialized['property_name'] == 'loading'


def test_state_variable_different_instances():
    """Test that multiple calls to the same property return different StateVariable instances."""

    def dummy_func(x):
        return x * 2

    dv = DerivedVariable(dummy_func, variables=[])
    loading_var1 = dv.is_loading
    loading_var2 = dv.is_loading

    # Should be different instances with different UIDs
    assert loading_var1 is not loading_var2
    assert loading_var1.uid != loading_var2.uid
    assert loading_var1.parent_variable == loading_var2.parent_variable
    assert loading_var1.property_name == loading_var2.property_name


def test_state_variable_forbidden_in_derived_variable():
    """Test that StateVariables cannot be used as inputs to DerivedVariables."""
    from dara.core import Variable

    def dummy_func(x):
        return x * 2

    # Create a DerivedVariable and get its state variable
    input_var = Variable(5)
    dv = DerivedVariable(dummy_func, variables=[input_var])
    loading_var = dv.is_loading

    # Try to create another DerivedVariable using the StateVariable as input
    def another_func(loading_state):
        return 'loading' if loading_state else 'ready'

    with pytest.raises(ValueError) as exc_info:
        DerivedVariable(another_func, variables=[loading_var])

    assert 'StateVariable cannot be used as input to DerivedVariable' in str(exc_info.value)
    assert 'difficult to debug' in str(exc_info.value)
