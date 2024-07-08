import { CausalGraph, EdgeType, VariableType } from '../src/types';

export const MockCausalGraph: CausalGraph = {
    edges: {
        input1: {
            target1: {
                destination: {
                    identifier: 'target1',
                    meta: { rendering_properties: { label_size: 25, size: 60 } },
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'input1',
                    meta: {
                        original: 'metadata',
                        rendering_properties: {
                            label: 'input1 label',
                        },
                    },
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            target2: {
                destination: {
                    identifier: 'target2',
                    meta: {},
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: { original: 'metadata', rendering_properties: { color: '#7510F7', thickness: 10 } },
                source: {
                    identifier: 'input1',
                    meta: {
                        original: 'metadata',
                        rendering_properties: {
                            label: 'input1 label',
                        },
                    },
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
        input2: {
            target1: {
                destination: {
                    identifier: 'target1',
                    meta: { rendering_properties: { label_size: 25, size: 60 } },
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.BACKWARDS_DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'input2',
                    meta: {},
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
            target2: {
                destination: {
                    identifier: 'target2',
                    meta: {},
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: {
                    identifier: 'input2',
                    meta: {},
                    node_class: 'Node',
                    variable_type: VariableType.UNSPECIFIED,
                },
            },
        },
    },
    nodes: {
        input1: {
            identifier: 'input1',
            meta: {
                original: 'metadata',
                rendering_properties: {
                    label: 'input1 label',
                },
            },
            node_class: 'Node',
            variable_type: VariableType.UNSPECIFIED,
        },
        input2: {
            identifier: 'input2',
            meta: {},
            node_class: 'Node',
            variable_type: VariableType.UNSPECIFIED,
        },
        target1: {
            identifier: 'target1',
            meta: { rendering_properties: { label_size: 25, size: 60 } },
            node_class: 'Node',
            variable_type: VariableType.UNSPECIFIED,
        },
        target2: { identifier: 'target2', meta: {}, node_class: 'Node', variable_type: VariableType.UNSPECIFIED },
    },
    version: '2',
};
