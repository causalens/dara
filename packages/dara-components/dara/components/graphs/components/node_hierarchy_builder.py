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

from typing import Any, Dict, List, Optional, Union

from pydantic import field_validator

from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import ClientVariable


class NodeMeta(BaseModel):
    label_size: Optional[int] = None
    wrap_text: Optional[bool] = None
    label: Optional[str] = None
    tooltip: Optional[Union[str, Dict[str, str]]] = None


class Node(BaseModel):
    name: str
    meta: Optional[NodeMeta] = None

    Meta = NodeMeta


class NodeHierarchyBuilder(StyledComponentInstance):
    """
    ![NodeHierarchyBuilder](../../../../../docs/packages/dara-components/graphs/assets/NodeHierarchyBuilder.png)
    The NodeHierarchyBuilder component visually represents node hierarchy in layers, allowing the user
    to re-arrange the nodes inside layers, move them between layers and add/delete new layers.

    ```python

    from dara.components.graphs import NodeHierarchyBuilder, Node

    # nodes can be defined as strings; either as just a list or with predefined layers
    nodes = ['first node', 'second node', 'third node']
    nodes = [
        ['first node', 'second node'],
        ['third node']
    ]

    # They can also be node objects which allow to specify extra metadata to override certain display properties
    nodes = [
        [
            Node(
                name='1',
                meta=Node.Meta(label='alternative display label')
            )
        ],
        [
            Node(
                name='No wrap',
                meta=Node.Meta(wrap_text=False)
            ),
            Node(
                name='Override text size',
                meta=Node.Meta(label_size=20)
            ),
            Node(
                name='Tooltip string',
                meta=Node.Meta(tooltip='my custom tooltip')
            ),
            Node(
                name='Tooltip object',
                meta=Node.Meta(tooltip={'key1': 'val1', 'key2': 'val2'})
            )
        ]
    ]

    # nodes can also be in a variable; Note: if defined as a variable, they must be passed as a list of lists

    nodes = Variable([
        ['first node', 'second node'],
        ['third node']
    ])

    nodes = Variable([
        [Node(name='first')],
        [Node('second'), Node('third')]
    ])

    ```

    :param nodes: List of nodes - can be a variable, a list of strings, a list of lists of strings,
    a list of Node objects or a list of lists of Node objects
    :param node_font_size: Optional font size of node text in pixels
    :param node_size: Optional diameter of the nodes displayed in pixels
    :param on_update: Optional event handler for all hierarchy changes
    :param wrap_node_text: Optional flag whether to wrap the text inside nodes or use an ellipsis; defaults to true
    """

    js_module = '@darajs/components'

    editable: bool = True
    nodes: Union[List[List[str]], List[str], List[Node], List[List[Node]], ClientVariable]
    node_font_size: Optional[int] = None
    node_size: Optional[int] = None
    on_update: Optional[Action] = None
    wrap_node_text: bool = True

    @field_validator('nodes')
    @classmethod
    def validate_nodes(cls, nodes: Any) -> Union[ClientVariable, List[List[str]], List[List[Node]]]:
        if isinstance(nodes, ClientVariable):
            return nodes
        if not isinstance(nodes, list):
            raise ValueError('Nodes provided to NodeHierarchyBuilder must be a Variable or a list of strings/Nodes')

        # Nodes is a list of lists
        if all(isinstance(node, list) for node in nodes):
            return nodes

        # Nodes is a list - put them all in one layer
        return [nodes]
