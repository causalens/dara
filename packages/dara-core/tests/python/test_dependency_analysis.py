"""
Tests for router dependency analysis functionality.
Tests the static analysis of component trees to build dependency graphs for derived state.
"""

from typing import Any

from pydantic import Field

from dara.core import DerivedVariable, Variable, py_component
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import AnyVariable, Condition, Operator
from dara.core.router import (
    DependencyGraph,
)


class MockComponent(ComponentInstance):
    value: Any = None
    children: list = Field(default_factory=list)


# Mock control flow components that match the real component field names
# The dependency analysis uses type(component).__name__ to identify them
class If(ComponentInstance):
    """Mock If component for testing control flow boundary behavior"""

    condition: Condition
    true_children: list[ComponentInstance] = Field(default_factory=list)
    false_children: list[ComponentInstance] = Field(default_factory=list)


class Match(ComponentInstance):
    """Mock Match component for testing control flow boundary behavior"""

    value: AnyVariable
    when: dict[str | int | float, ComponentInstance | None] = Field(default_factory=dict)
    default: ComponentInstance | None = None


class For(ComponentInstance):
    """Mock For component for testing control flow boundary behavior"""

    items: AnyVariable
    renderer: ComponentInstance
    placeholder: ComponentInstance | None = None


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


class TestControlFlowBoundaries:
    """Test that control flow components act as boundaries for dependency analysis"""

    def test_if_skips_conditional_children(self):
        """DVs inside If branches should NOT be collected (conditional)"""
        dv_true = DerivedVariable(lambda: 'true', variables=[Variable(1)])
        dv_false = DerivedVariable(lambda: 'false', variables=[Variable(2)])

        condition_var = Variable(True)
        if_component = If(
            condition=Condition(operator=Operator.TRUTHY, variable=condition_var, other=None),
            true_children=[MockComponent(value=dv_true)],
            false_children=[MockComponent(value=dv_false)],
        )

        graph = DependencyGraph.from_component(if_component)

        # Neither branch's DVs should be collected
        assert len(graph.derived_variables) == 0
        assert len(graph.py_components) == 0

    def test_if_condition_variable_not_collected(self):
        """DV nested inside Condition object is not collected (not a ComponentInstance)

        Note: This is a pre-existing limitation. DVs inside Condition objects are not
        collected because Condition is not a ComponentInstance and the analysis doesn't
        recurse into arbitrary Pydantic models. The DV will still be resolved at runtime.
        """
        condition_dv = DerivedVariable(lambda: True, variables=[Variable(1)])
        dv_inside = DerivedVariable(lambda: 'inside', variables=[Variable(2)])

        if_component = If(
            condition=Condition(operator=Operator.TRUTHY, variable=condition_dv, other=None),
            true_children=[MockComponent(value=dv_inside)],
            false_children=[],
        )

        graph = DependencyGraph.from_component(if_component)

        # Condition.variable DVs are not collected (Condition is not a ComponentInstance)
        # The conditional children DVs are also not collected (control flow boundary)
        assert len(graph.derived_variables) == 0

    def test_match_skips_conditional_children(self):
        """DVs inside Match branches should NOT be collected (conditional)"""
        dv_case1 = DerivedVariable(lambda: 'case1', variables=[Variable(1)])
        dv_case2 = DerivedVariable(lambda: 'case2', variables=[Variable(2)])
        dv_default = DerivedVariable(lambda: 'default', variables=[Variable(3)])

        match_var = Variable('option1')
        match_component = Match(
            value=match_var,
            when={
                'option1': MockComponent(value=dv_case1),
                'option2': MockComponent(value=dv_case2),
            },
            default=MockComponent(value=dv_default),
        )

        graph = DependencyGraph.from_component(match_component)

        # No DVs from branches should be collected
        assert len(graph.derived_variables) == 0
        assert len(graph.py_components) == 0

    def test_match_collects_value_variable(self):
        """DV used as Match value SHOULD be collected (always evaluated)"""
        value_dv = DerivedVariable(lambda: 'option1', variables=[Variable(1)])
        dv_inside = DerivedVariable(lambda: 'inside', variables=[Variable(2)])

        match_component = Match(
            value=value_dv,
            when={'option1': MockComponent(value=dv_inside)},
            default=None,
        )

        graph = DependencyGraph.from_component(match_component)

        # Only the value DV should be collected
        assert len(graph.derived_variables) == 1
        assert value_dv.uid in graph.derived_variables

    def test_for_skips_renderer_and_placeholder(self):
        """DVs inside For renderer/placeholder should NOT be collected"""
        dv_renderer = DerivedVariable(lambda: 'renderer', variables=[Variable(1)])
        dv_placeholder = DerivedVariable(lambda: 'placeholder', variables=[Variable(2)])

        items_var = Variable([1, 2, 3])
        for_component = For(
            items=items_var,
            renderer=MockComponent(value=dv_renderer),
            placeholder=MockComponent(value=dv_placeholder),
        )

        graph = DependencyGraph.from_component(for_component)

        # No DVs from renderer/placeholder should be collected
        assert len(graph.derived_variables) == 0
        assert len(graph.py_components) == 0

    def test_for_collects_items_variable(self):
        """DV used as For items SHOULD be collected (always evaluated)"""
        items_dv = DerivedVariable(lambda: [1, 2, 3], variables=[Variable(1)])
        dv_inside = DerivedVariable(lambda: 'inside', variables=[Variable(2)])

        for_component = For(
            items=items_dv,
            renderer=MockComponent(value=dv_inside),
        )

        graph = DependencyGraph.from_component(for_component)

        # Only the items DV should be collected
        assert len(graph.derived_variables) == 1
        assert items_dv.uid in graph.derived_variables

    def test_nested_control_flow_boundary(self):
        """Nested control flow components should all act as boundaries"""
        dv_outer = DerivedVariable(lambda: 'outer', variables=[Variable(1)])
        dv_inner = DerivedVariable(lambda: 'inner', variables=[Variable(2)])

        # Nested If inside Match
        inner_if = If(
            condition=Condition(operator=Operator.TRUTHY, variable=Variable(True), other=None),
            true_children=[MockComponent(value=dv_inner)],
            false_children=[],
        )

        match_component = Match(
            value=Variable('option'),
            when={'option': inner_if},
            default=MockComponent(value=dv_outer),
        )

        graph = DependencyGraph.from_component(match_component)

        # No DVs should be collected - Match.when and Match.default are skipped
        assert len(graph.derived_variables) == 0

    def test_control_flow_inside_regular_component(self):
        """Control flow components nested in regular components should still act as boundaries"""
        dv_regular = DerivedVariable(lambda: 'regular', variables=[Variable(1)])
        dv_conditional = DerivedVariable(lambda: 'conditional', variables=[Variable(2)])

        if_component = If(
            condition=Condition(operator=Operator.TRUTHY, variable=Variable(True), other=None),
            true_children=[MockComponent(value=dv_conditional)],
            false_children=[],
        )

        parent = MockComponent(value=dv_regular, children=[if_component])

        graph = DependencyGraph.from_component(parent)

        # Only the regular DV should be collected, not the conditional one
        assert len(graph.derived_variables) == 1
        assert dv_regular.uid in graph.derived_variables
