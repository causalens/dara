"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional, Union

from pydantic import BaseModel

from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import NonDataVariable


class Node(BaseModel):
    """
    The building block of hierarchical lists. Take an id and label to identify a given node. Hierarchical lists
    are represented by stacking further Node components as children of a Node.
    """

    children: Optional[List['Node']]
    id: str
    label: str
    weight: float

    @staticmethod
    def from_string(name: str, weight: Optional[float] = None, children: Optional[List['Node']] = None):
        return Node(id=name, label=name, children=children, weight=weight if weight is not None else 0.0)

    def find_node(self, target: str) -> Optional['Node']:
        """
        Find a node in a hierarchy structure, returns None if not found

        :param hierarchy: the hierarchy to search
        :param target: the node id to find
        """
        if self.id == target:
            return self
        if self.children is not None:
            for child in self.children:
                if child.id == target:
                    return child
                if child.children is not None and len(child.children) > 0:
                    node = child.find_node(target)
                    if node is not None:
                        return node
        return None


Node.update_forward_refs()


class HierarchySelector(StyledComponentInstance):
    """
    A component that displays an interactive hierarchy tree that can be selected from. Built by hierarchically stacking
    child Node components.
    """

    js_module = '@darajs/components'

    allow_category_select: bool = True
    allow_leaf_select: bool = True
    hierarchy: Node
    open_all: bool = True
    value: NonDataVariable


class HierarchyViewer(StyledComponentInstance):
    """
    The HierarchyViewer allows a weighted hierarchical data structure to be displayed as a treemap to quickly visualize
    the composition of the dataset.
    """

    js_module = '@darajs/components'

    allow_leaf_click: bool = True
    allow_parent_click: bool = True
    hierarchy: Union[Node, NonDataVariable]
    on_click_node: Optional[Action] = None
