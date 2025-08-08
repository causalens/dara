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

from typing import List, Optional, Union

from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import ClientVariable


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


Node.model_rebuild()


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
    value: ClientVariable


class HierarchyViewer(StyledComponentInstance):
    """
    The HierarchyViewer allows a weighted hierarchical data structure to be displayed as a treemap to quickly visualize
    the composition of the dataset.
    """

    js_module = '@darajs/components'

    allow_leaf_click: bool = True
    allow_parent_click: bool = True
    hierarchy: Union[Node, ClientVariable]
    on_click_node: Optional[Action] = None
