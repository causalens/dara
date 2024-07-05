/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React from 'react';

import { GraphState } from '../../types';

type UseIterateNodes = {
    nextNode: () => void;
    prevNode: () => void;
};

/**
 * Given a graph and a currently selected node,
 * provide next/previous functions for selecting the next/previous node.
 * @param selectedNode id of the currently selected node
 * @param setSelectedNode Method for setting the selected node state variable
 * @param state graph viewer state
 */
const useIterateNodes = (
    selectedNode: string,
    setSelectedNode: React.Dispatch<React.SetStateAction<string>>,
    state: GraphState
): UseIterateNodes => {
    const nextNode = (): void => {
        const nodes = state.graph.nodes();

        const selectedNodeIndex = nodes.findIndex((n) => n === selectedNode);
        const newNodeIndex = (selectedNodeIndex + 1) % nodes.length;

        setSelectedNode(nodes[newNodeIndex]);
    };

    const prevNode = (): void => {
        const nodes = state.graph.nodes();

        const selectedNodeIndex = nodes.findIndex((n) => n === selectedNode);

        let newNodeIndex = (selectedNodeIndex - 1) % nodes.length;

        if (newNodeIndex < 0) {
            newNodeIndex += nodes.length;
        }

        setSelectedNode(nodes[newNodeIndex]);
    };

    return {
        nextNode,
        prevNode,
    };
};

export default useIterateNodes;
