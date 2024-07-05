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
import { NotificationWrapper, useNotifications } from '@darajs/ui-notifications';

import { CausalGraph, EdgeType, VariableType } from '../../types';
import { CausalGraphEditorProps, default as CausalGraphViewerComponent } from '../causal-graph-editor';

export const Template = (args: CausalGraphEditorProps): JSX.Element => {
    const { pushNotification } = useNotifications();

    return (
        <>
            <CausalGraphViewerComponent {...args} onNotify={pushNotification} style={{ margin: 0 }} />
            <NotificationWrapper style={{ bottom: 0 }} />
        </>
    );
};

export const causalGraph: CausalGraph = {
    edges: {
        input1: {
            input4: {
                destination: {
                    identifier: 'input4',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {
                    rendering_properties: {
                        color: 'red',
                        description:
                            'my super long description text that spans a few lines, is super descriptive and goes in depth into the explanation of why this edge exists in the first place and this is some extra text that will be behind a scrollbar',
                        tooltip: {
                            key1: 'some value 1',
                            key2: 'some value 2',
                        },
                    },
                },
                source: {
                    identifier: 'input1',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            target: {
                destination: {
                    identifier: 'target',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'input1',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        input2: {
            target: {
                destination: {
                    identifier: 'target',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {
                    rendering_properties: {
                        description:
                            'my super long description text that spans a few lines, is super descriptive and goes in depth into the explanation of why this edge exists in the first place. It is actually so long that it does not fit by default and triggers overflow to scroll because of the max-height set to 5 lines',
                        tooltip: 'some plaintext description',
                    },
                },
                source: {
                    identifier: 'input2',
                    meta: {
                        rendering_properties: {
                            label: 'input2 renamed multi word node name',
                        },
                    },
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        input3: {
            target: {
                destination: {
                    identifier: 'target',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'input3',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        input4: {
            target: {
                destination: {
                    identifier: 'target',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: { rendering_properties: {} },
                source: {
                    identifier: 'input4',
                    meta: {},
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
    },
    nodes: {
        input1: {
            identifier: 'input1',
            meta: {
                rendering_properties: {
                    label: 'input1 renamed',
                },
            },
            variable_type: VariableType.UNSPECIFIED,
        },
        input2: {
            identifier: 'input2',
            meta: {
                rendering_properties: {
                    label: 'input2 renamed multi word node name',
                },
            },
            variable_type: VariableType.UNSPECIFIED,
        },
        input3: {
            identifier: 'input3',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        input4: {
            identifier: 'input4',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        target: {
            identifier: 'target',
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
    },
    version: '2.0',
};

export const pagCausalGraph = {
    ...causalGraph,
    edges: {
        ...causalGraph.edges,
        input1: {
            ...causalGraph.edges.input1,
            input4: {
                ...causalGraph.edges.input1.input4,
                edge_type: EdgeType.UNDIRECTED_EDGE,
            },
        },
    },
};

export const nodeTiersCausalGraph = {
    ...causalGraph,
    nodes: {
        ...causalGraph.nodes,
        input1: {
            ...causalGraph.nodes.input1,
            group: 'group1',
            meta: {
                ...causalGraph.nodes.input1.meta,
                rendering_properties: {
                    ...causalGraph.nodes.input1.meta.rendering_properties,
                    another: 'group3',
                },
                test: 'group2',
            },
            order: 2,
        },
        input2: {
            ...causalGraph.nodes.input2,
            group: 'group1',
            meta: {
                ...causalGraph.nodes.input2.meta,
                rendering_properties: {
                    ...causalGraph.nodes.input2.meta.rendering_properties,
                    another: 'group3',
                },
                test: 'group2',
            },
            order: 7,
        },
        input3: {
            ...causalGraph.nodes.input3,
            group: 'group2',
            meta: {
                ...causalGraph.nodes.input3.meta,
                rendering_properties: {
                    ...causalGraph.nodes.input3.meta.rendering_properties,
                    another: 'group3',
                },
                test: 'group1',
            },
            order: 3,
        },
        input4: {
            ...causalGraph.nodes.input4,
            group: 'group2',
            meta: {
                ...causalGraph.nodes.input4.meta,
                rendering_properties: {
                    ...causalGraph.nodes.input4.meta.rendering_properties,
                    another: 'group3',
                },
                test: 'group1',
            },
            order: 2,
        },

        target: {
            ...causalGraph.nodes.target,
            group: 'group3',
            meta: {
                ...causalGraph.nodes.target.meta,
                rendering_properties: {
                    ...causalGraph.nodes.target.meta.rendering_properties,
                    another: 'group1',
                },
                test: 'group3',
            },
        },
    },
};

export const nodeTiersList = [['input1', 'input2'], ['input3', 'input4'], ['target']];

export const timeSeriesCausalGraph = {
    edges: {
        X1: {
            X3: {
                destination: {
                    identifier: 'X3',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X3',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X3',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        'X1 lag(n=1)': {
            X1: {
                destination: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1 lag(n=1)',
                    meta: {
                        time_lag: -1,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -1,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        'X1 lag(n=2)': {
            X1: {
                destination: {
                    identifier: 'X1',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X1 lag(n=2)',
                    meta: {
                        time_lag: -2,
                        variable_name: 'X1',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -2,
                    variable_name: 'X1',
                    variable_type: 'unspecified',
                },
            },
        },
        X2: {
            X3: {
                destination: {
                    identifier: 'X3',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X3',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X3',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X2',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
            },
        },
        'X2 lag(n=1)': {
            X2: {
                destination: {
                    identifier: 'X2',
                    meta: {
                        time_lag: 0,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: 0,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {},
                source: {
                    identifier: 'X2 lag(n=1)',
                    meta: {
                        time_lag: -1,
                        variable_name: 'X2',
                    },
                    node_class: 'TimeSeriesNode',
                    time_lag: -1,
                    variable_name: 'X2',
                    variable_type: 'unspecified',
                },
            },
        },
    },
    nodes: {
        X1: {
            identifier: 'X1',
            meta: {
                time_lag: 0,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        'X1 lag(n=1)': {
            identifier: 'X1 lag(n=1)',
            meta: {
                time_lag: -1,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -1,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        'X1 lag(n=2)': {
            identifier: 'X1 lag(n=2)',
            meta: {
                time_lag: -2,
                variable_name: 'X1',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -2,
            variable_name: 'X1',
            variable_type: 'unspecified',
        },
        X2: {
            identifier: 'X2',
            meta: {
                time_lag: 0,
                variable_name: 'X2',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X2',
            variable_type: 'unspecified',
        },
        'X2 lag(n=1)': {
            identifier: 'X2 lag(n=1)',
            meta: {
                time_lag: -1,
                variable_name: 'X2',
            },
            node_class: 'TimeSeriesNode',
            time_lag: -1,
            variable_name: 'X2',
            variable_type: 'unspecified',
        },
        X3: {
            identifier: 'X3',
            meta: {
                time_lag: 0,
                variable_name: 'X3',
            },
            node_class: 'TimeSeriesNode',
            time_lag: 0,
            variable_name: 'X3',
            variable_type: 'unspecified',
        },
    },
    version: '0.3.14',
};

export const planarLayoutCausalGraph = {
    edges: {
        '0': {
            '16': {
                destination: {
                    identifier: '16',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '0',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '1': {
            '14': {
                destination: {
                    identifier: '14',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '1',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '11': {
            '3': {
                destination: {
                    identifier: '3',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '11',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '12': {
            '13': {
                destination: {
                    identifier: '13',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '12',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '4': {
                destination: {
                    identifier: '4',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '12',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '13': {
            '20': {
                destination: {
                    identifier: '20',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '13',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '15': {
            '6': {
                destination: {
                    identifier: '6',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '15',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '16': {
            '10': {
                destination: {
                    identifier: '10',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '16',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '17': {
            '6': {
                destination: {
                    identifier: '6',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '17',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '7': {
                destination: {
                    identifier: '7',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '17',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '18': {
            '5': {
                destination: {
                    identifier: '5',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '18',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '19': {
            '17': {
                destination: {
                    identifier: '17',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '19',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '2': {
            '11': {
                destination: {
                    identifier: '11',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '2',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '20': {
            '7': {
                destination: {
                    identifier: '7',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '20',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '21': {
            '10': {
                destination: {
                    identifier: '10',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '21',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '12': {
                destination: {
                    identifier: '12',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '21',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '7': {
                destination: {
                    identifier: '7',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '21',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '3': {
            '7': {
                destination: {
                    identifier: '7',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '3',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '4': {
            '13': {
                destination: {
                    identifier: '13',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '4',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '9': {
                destination: {
                    identifier: '9',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '4',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '8': {
            '0': {
                destination: {
                    identifier: '0',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '8',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '14': {
                destination: {
                    identifier: '14',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '8',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
        '9': {
            '18': {
                destination: {
                    identifier: '18',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '9',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
            '6': {
                destination: {
                    identifier: '6',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
                edge_type: '->',
                meta: {
                    rendering_properties: {},
                },
                source: {
                    identifier: '9',
                    meta: {
                        rendering_properties: {
                            latent: false,
                        },
                    },
                    node_class: 'Node',
                    variable_type: 'unspecified',
                },
            },
        },
    },
    nodes: {
        '0': {
            identifier: '0',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '1': {
            identifier: '1',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '10': {
            identifier: '10',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '11': {
            identifier: '11',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '12': {
            identifier: '12',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '13': {
            identifier: '13',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '14': {
            identifier: '14',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '15': {
            identifier: '15',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '16': {
            identifier: '16',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '17': {
            identifier: '17',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '18': {
            identifier: '18',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '19': {
            identifier: '19',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '2': {
            identifier: '2',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '20': {
            identifier: '20',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '21': {
            identifier: '21',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '3': {
            identifier: '3',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '4': {
            identifier: '4',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '5': {
            identifier: '5',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '6': {
            identifier: '6',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '7': {
            identifier: '7',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '8': {
            identifier: '8',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
        '9': {
            identifier: '9',
            meta: {
                rendering_properties: {
                    latent: false,
                },
            },
            node_class: 'Node',
            variable_type: 'unspecified',
        },
    },
    version: '0.3.14',
};
