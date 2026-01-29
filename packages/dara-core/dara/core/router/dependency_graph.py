from pydantic import BaseModel, Field, SerializeAsAny

from dara.core.definitions import ComponentInstance
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.visual.dynamic_component import PyComponentInstance

# Control flow components have conditional children that shouldn't be preloaded
# since only one branch will actually render at runtime
CONTROL_FLOW_SKIP_ATTRS: dict[str, set[str]] = {
    'If': {'true_children', 'false_children'},
    'Match': {'when', 'default'},
    'For': {'renderer', 'placeholder'},
}


class DependencyGraph(BaseModel):
    """
    Data structure representing dependencies for derived state on a page
    """

    derived_variables: SerializeAsAny[dict[str, DerivedVariable]] = Field(default_factory=dict)
    """
    Map of DerivedVariable instances
    """

    py_components: SerializeAsAny[dict[str, PyComponentInstance]] = Field(default_factory=dict)
    """
    Map of PyComponentInstance instances
    """

    @staticmethod
    def from_component(component: ComponentInstance) -> 'DependencyGraph':
        """
        Create a DependencyGraph from a ComponentInstance
        """
        graph = DependencyGraph()
        _analyze_component_dependencies(component, graph)
        return graph


def _analyze_component_dependencies(component: ComponentInstance, graph: DependencyGraph) -> None:
    """
    Recursively analyze a component tree to build a dependency graph of DerivedVariables and PyComponentInstances.

    Note: Control flow components (If, Match, For) are treated as boundaries - their conditional
    child properties are not recursed into since only one branch will render at runtime.
    """
    try:
        from dara.components import Table
    except ImportError:
        Table = None

    # The component itself is a PyComponentInstance
    if isinstance(component, PyComponentInstance):
        if component.uid not in graph.py_components:
            graph.py_components[component.uid] = component
        return

    # Get properties to skip for control flow components
    component_name = type(component).__name__
    skip_attrs = CONTROL_FLOW_SKIP_ATTRS.get(component_name, set())

    # otherwise check each field
    for attr in component.model_fields_set:
        # Skip conditional child properties of control flow components
        if attr in skip_attrs:
            continue
        value = getattr(component, attr, None)

        # Handle encountered variables and py_components
        if isinstance(value, DerivedVariable) and value.uid not in graph.derived_variables:
            # SPECIAL CASE: exclude Table.data since it's tabular and preloading it would be a waste
            if Table and isinstance(component, Table) and attr == 'data':
                continue
            graph.derived_variables[value.uid] = value
        elif isinstance(value, PyComponentInstance) and value.uid not in graph.py_components:
            graph.py_components[value.uid] = value
        # Recursion cases:
        # component instances
        elif isinstance(value, ComponentInstance):
            _analyze_component_dependencies(value, graph)
        # component lists
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, ComponentInstance):
                    _analyze_component_dependencies(item, graph)
