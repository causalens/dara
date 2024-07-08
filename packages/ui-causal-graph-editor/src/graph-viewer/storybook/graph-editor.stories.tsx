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
import { useEffect, useState } from 'react';

import { Accordion } from '@darajs/ui-components';

import { CircularLayout, FcoseLayout, PlanarLayout, SpringLayout } from '../../shared/graph-layout';
import { CausalGraph, EdgeType, VariableType } from '../../types';
import { CausalGraphEditorProps, default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, causalGraph, timeSeriesCausalGraph } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor',
} as Meta;

export const Interactive = (args: CausalGraphEditorProps): JSX.Element => {
    const [nodeNumber, setNodeNumber] = useState(3);
    const [useStrenghts, setUseStrengths] = useState(false);
    const [initialGraphData, setInitialGraphData] = useState<CausalGraph>({
        edges: {},
        nodes: {},
        version: '2.0',
    });

    function updateInitialGraph(val: number): void {
        const updatedGraph = { ...initialGraphData, edges: {}, nodes: {} };

        let firstKey: string | null = null;

        for (let i = 0; i < val; i++) {
            const newKey = `node-${i}`;

            updatedGraph.nodes[newKey] = {
                meta: { rendering_properties: {} },
                variable_type: VariableType.UNSPECIFIED,
            };

            if (firstKey) {
                updatedGraph.edges[firstKey][newKey] = {
                    edge_type: EdgeType.DIRECTED_EDGE,
                    meta: { rendering_properties: {} },
                };

                if (useStrenghts) {
                    updatedGraph.edges[firstKey][newKey].meta.rendering_properties.thickness = i;
                    updatedGraph.edges[firstKey][newKey].meta.rendering_properties.tooltip = `Thickness: ${i}`;
                }
            } else {
                firstKey = newKey;
                updatedGraph.edges[firstKey] = {};
            }
        }

        setInitialGraphData(updatedGraph);
    }

    useEffect(() => {
        updateInitialGraph(nodeNumber);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodeNumber, useStrenghts]);

    function onUpdate(data): void {
        setInitialGraphData(data);
    }

    if (Object.keys(initialGraphData.nodes).length === 0) {
        return <span>No nodes</span>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div>
                <span>Number of nodes: </span>
                <select onChange={(e) => setNodeNumber(Number(e.target.value))} value={nodeNumber}>
                    {Array(20)
                        .fill(0)
                        .map((_, idx) => (
                            <option key={idx} value={idx}>
                                {idx}
                            </option>
                        ))}
                </select>
                <span>use thickness: </span>
                <input checked={useStrenghts} onChange={() => setUseStrengths((x) => !x)} type="checkbox" />
            </div>
            <CausalGraphViewerComponent
                {...args}
                graphData={initialGraphData}
                onUpdate={onUpdate}
                style={{ margin: 0 }}
            />
        </div>
    );
};
Interactive.args = {
    additionalLegends: [
        {
            label: 'Other',
            type: 'node',
        },
        {
            label: 'Other',
            type: 'edge',
        },
    ],
    editable: true,
    graphLayout: PlanarLayout.Builder.build(),
};

/**
 * Tests scenario where the graph is collapsed, to ensure e.g. tooltips don't bleed out of the container
 */
export const Collapsed = (args: CausalGraphEditorProps): JSX.Element => {
    return (
        <Accordion
            items={[
                {
                    content: <CausalGraphViewerComponent {...args} style={{ height: '300px' }} />,
                    label: 'Graph',
                },
            ]}
        />
    );
};
Collapsed.args = {
    editable: true,
    graphData: causalGraph,
    graphLayout: PlanarLayout.Builder.build(),
};

export const Scrollable = (args: CausalGraphEditorProps): JSX.Element => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '500px', overflow: 'auto' }}>
            {Array(50)
                .fill(0)
                .map((_, idx) => (
                    <span key={idx}>{idx}</span>
                ))}
            <CausalGraphViewerComponent {...args} style={{ minHeight: '500px' }} />
            {Array(50)
                .fill(0)
                .map((_, idx) => (
                    <span key={idx}>{idx}</span>
                ))}
        </div>
    );
};
Scrollable.args = {
    editable: true,
    graphData: causalGraph,
    graphLayout: PlanarLayout.Builder.build(),
};

export const Circular = Template.bind({});
Circular.args = {
    editable: true,
    graphData: causalGraph,
    graphLayout: CircularLayout.Builder.build(),
};

const singleLetterGraph: CausalGraph = {
    edges: {
        'a b c': {
            b: {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {
                    rendering_properties: {},
                },
            },
        },
    },
    nodes: {
        'a b c': {
            meta: {
                rendering_properties: {},
            },
            variable_type: VariableType.UNSPECIFIED,
        },
        b: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
    },
    version: '2.0',
};
export const SingleLetter = Template.bind({});
SingleLetter.args = {
    editable: true,
    graphData: singleLetterGraph,
    graphLayout: SpringLayout.Builder.nodeFontSize(80).build(),
};

const longWordGraph: CausalGraph = {
    edges: {
        super_long_single_word_without_spaces: {
            b: {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {
                    rendering_properties: {},
                },
            },
        },
    },
    nodes: {
        b: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        super_long_single_word_without_spaces: {
            meta: {
                rendering_properties: {},
            },
            variable_type: VariableType.UNSPECIFIED,
        },
    },
    version: '2.0',
};

export const LongWord = Template.bind({});
LongWord.args = {
    editable: true,
    graphData: longWordGraph,
    graphLayout: SpringLayout.Builder.build(),
};

export const TimeSeries = Template.bind({});

const timeSeriesLayout = FcoseLayout.Builder.build();

TimeSeries.args = {
    editable: true,
    graphData: timeSeriesCausalGraph,
    graphLayout: timeSeriesLayout,
};

export const Empty = Template.bind({});
Empty.args = {
    editable: false,
    graphData: {
        edges: {},
        nodes: {},
        version: '2.0',
    },
    graphLayout: FcoseLayout.Builder.build(),
};
