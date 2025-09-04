"""
Tests for router dependency analysis functionality.
Tests the static analysis of component trees to build dependency graphs for derived state.
"""

from typing import Any

from pydantic import Field

from dara.core import DerivedVariable, Variable, py_component
from dara.core.definitions import ComponentInstance
from dara.core.router import (
    DependencyGraph,
)


class MockComponent(ComponentInstance):
    value: Any
    children: list = Field(default_factory=list)


class TestDependencyAnalysis:
    """Test dependency analysis functionality"""

    def test_analyze_single_variable(self):
        dv = DerivedVariable(lambda: None, variables=[Variable(1)])
        comp = MockComponent(value=dv)

        graph = DependencyGraph.from_component(comp)
        assert len(graph.derived_variables) == 1
        assert graph.derived_variables[dv.uid] == dv
        assert len(graph.py_components) == 0

    def test_analyze_py_component(self):
        dv = DerivedVariable(lambda: None, variables=[Variable(1)])
        dv2 = DerivedVariable(lambda: None, variables=[Variable(2)])

        @py_component
        def py_comp(value):
            return MockComponent(value=value)

        py_comp_instance = py_comp(value=dv2)

        comp = MockComponent(value=dv, children=[py_comp_instance])
        graph = DependencyGraph.from_component(comp)

        assert len(graph.derived_variables) == 1
        assert graph.derived_variables[dv.uid] == dv
        assert len(graph.py_components) == 1
        assert graph.py_components[py_comp_instance.uid] == py_comp_instance

    def test_nested_analysis(self):
        dv = DerivedVariable(lambda: None, variables=[Variable(1)])
        dv2 = DerivedVariable(lambda: None, variables=[Variable(2)])

        @py_component
        def py_comp(value):
            return MockComponent(value=value)

        py_comp_instance = py_comp(value=dv2)
        child_component = MockComponent(value=dv)

        parent_component = MockComponent(value='value', children=[py_comp_instance, child_component])
        graph = DependencyGraph.from_component(parent_component)

        assert len(graph.derived_variables) == 1
        assert graph.derived_variables[dv.uid] == dv
        assert len(graph.py_components) == 1
        assert graph.py_components[py_comp_instance.uid] == py_comp_instance
