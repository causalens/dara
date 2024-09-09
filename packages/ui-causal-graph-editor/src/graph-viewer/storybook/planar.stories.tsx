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
import { Meta } from '@storybook/react';
import * as React from 'react';

import { SHIPPED_UNITS } from '../../../tests/mocks/graphs';
import { PlanarLayout } from '../../shared/graph-layout';
import { CausalGraph, EdgeType, LayeringAlgorithm } from '../../types';
import { CausalGraphEditorProps, default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, causalGraph, nodeTiersCausalGraph, planarLayoutCausalGraph } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/Planar',
} as Meta;

export const PlanarVertical = Template.bind({});
PlanarVertical.args = {
    editable: true,
    graphData: { ...causalGraph, edges: { input2: causalGraph.edges.input2 } },
    graphLayout: PlanarLayout.Builder.orientation('vertical').build(),
};

export const PlanarHorizontal = Template.bind({});
PlanarHorizontal.args = {
    editable: true,
    graphData: SHIPPED_UNITS,
    graphLayout: PlanarLayout.Builder.build(),
};

export const PlanarLayoutAlgos = (): JSX.Element => {
    const planarSimplex = PlanarLayout.Builder.build();
    planarSimplex.layeringAlgorithm = LayeringAlgorithm.SIMPLEX;

    const planarLongestPath = PlanarLayout.Builder.build();
    planarLongestPath.layeringAlgorithm = LayeringAlgorithm.LONGEST_PATH;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <span>Simplex:</span>
            <CausalGraphViewerComponent
                graphData={planarLayoutCausalGraph}
                graphLayout={planarSimplex}
                style={{ margin: 0 }}
            />
            <span>Longest Path:</span>
            <CausalGraphViewerComponent
                graphData={planarLayoutCausalGraph}
                graphLayout={planarLongestPath}
                style={{ margin: 0 }}
            />
        </div>
    );
};

export const PlanarTiers = Template.bind({});
const planarLayout = PlanarLayout.Builder.build();
planarLayout.tiers = { group: 'meta.test', order_nodes_by: 'order' };
// planarLayout.tiers = nodeTiersList;
// planarLayout.tiers = { group: 'meta.group', rank: ['a', 'b', 'c', 'd', 'e'] };

PlanarTiers.args = {
    editable: true,
    graphData: nodeTiersCausalGraph,
    // graphData: FRAUD,
    graphLayout: planarLayout,
};

function generateRandomDAG(parentsPerNode: number, levels: number): CausalGraph {
    const graph: CausalGraph = {
        nodes: {},
        edges: {},
        version: '0.5.3',
    };

    let nodeCounter = 0;

    function addNode(): string {
        const nodeName = `node${nodeCounter++}`;
        graph.nodes[nodeName] = {
            identifier: nodeName,
            meta: {},
            variable_type: 'unspecified',
        };
        graph.edges[nodeName] = {};
        return nodeName;
    }

    function generateLevel(currentLevel: number): string[] {
        if (currentLevel === 0) {
            // Base case: create and return the sink node
            return [addNode()];
        }

        const currentLevelNodes: string[] = [];
        const childNodes = generateLevel(currentLevel - 1);

        for (const childNode of childNodes) {
            for (let i = 0; i < Math.max(1, parentsPerNode - currentLevel); i++) {
                const parentNode = addNode();
                currentLevelNodes.push(parentNode);
                graph.edges[parentNode][childNode] = {
                    source: graph.nodes[parentNode],
                    destination: graph.nodes[childNode],
                    edge_type: EdgeType.DIRECTED_EDGE,
                    meta: {},
                };
            }
        }

        return currentLevelNodes;
    }

    generateLevel(levels);

    return graph;
}

export const PlanarGenerated = (props: CausalGraphEditorProps): JSX.Element => {
    const [parentCount, setParentCount] = React.useState(4);
    const [levelCount, setLevelCount] = React.useState(6);

    const graph = React.useMemo(() => generateRandomDAG(parentCount, levelCount), [parentCount, levelCount]);

    /* eslint-disable jsx-a11y/label-has-associated-control  */
    return (
        <>
            <label>
                Parent count:
                <input type="number" value={parentCount} onChange={(e) => setParentCount(parseInt(e.target.value))} />
            </label>
            <label>
                Level count:
                <input type="number" value={levelCount} onChange={(e) => setLevelCount(parseInt(e.target.value))} />
            </label>
            <CausalGraphViewerComponent {...props} graphData={graph} />
        </>
    );
};

PlanarGenerated.args = {
    editable: true,
    graphLayout: PlanarLayout.Builder.build(),
};
