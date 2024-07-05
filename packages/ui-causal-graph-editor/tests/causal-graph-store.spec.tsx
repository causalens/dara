import Graph from 'graphology';

import { GraphActionCreators, GraphReducer } from '../src/shared/causal-graph-store';
import { EdgeType, EditorMode, GraphState, SimulationEdge, SimulationNode, VariableType } from '../src/types';

const DEFAULT_EDGE: SimulationEdge = { edge_type: EdgeType.DIRECTED_EDGE, originalMeta: {} };
const DEFAULT_NODE = (id: string): SimulationNode => ({
    id,
    originalMeta: {},
    variable_type: VariableType.UNSPECIFIED,
});
const DEFAULT_LATENT_NODE = (id: string): SimulationNode => ({
    id,
    'meta.rendering_properties.latent': true,
    originalMeta: {},
    variable_type: VariableType.UNSPECIFIED,
});

const initialState = (): GraphState => ({
    editorMode: EditorMode.DEFAULT,
    graph: new Graph<SimulationNode, SimulationEdge>().import({
        edges: [],
        nodes: [
            { attributes: DEFAULT_NODE('node1'), key: 'node1' },
            { attributes: DEFAULT_NODE('node2'), key: 'node2' },
        ],
    }),
});

const dagInitialState = (): GraphState => ({
    editorMode: EditorMode.DEFAULT,
    graph: new Graph<SimulationNode, SimulationEdge>().import({
        edges: [
            {
                attributes: {
                    edge_type: EdgeType.DIRECTED_EDGE,
                    originalMeta: {},
                },
                source: 'node1',
                target: 'node2',
            },
            {
                attributes: {
                    edge_type: EdgeType.DIRECTED_EDGE,
                    originalMeta: {},
                },
                source: 'node2',
                target: 'node3',
            },
            {
                attributes: {
                    edge_type: EdgeType.DIRECTED_EDGE,
                    originalMeta: {},
                },
                source: 'node3',
                target: 'node1',
            },
        ],
        nodes: [
            { attributes: DEFAULT_NODE('node1'), key: 'node1' },
            { attributes: DEFAULT_NODE('node2'), key: 'node2' },
            { attributes: DEFAULT_NODE('node3'), key: 'node3' },
            { attributes: DEFAULT_NODE('node4'), key: 'node4' },
        ],
    }),
});

const linkedState = (): GraphState => ({
    editorMode: EditorMode.DEFAULT,
    graph: new Graph<SimulationNode, SimulationEdge>().import({
        edges: [
            {
                attributes: {
                    edge_type: EdgeType.DIRECTED_EDGE,
                    originalMeta: {},
                },
                source: 'node1',
                target: 'node2',
            },
        ],
        nodes: [
            { attributes: DEFAULT_NODE('node1'), key: 'node1' },
            { attributes: DEFAULT_NODE('node2'), key: 'node2' },
        ],
    }),
});

const actions = GraphActionCreators;

describe('CausalGraphStore', () => {
    describe('Accept Edge', () => {
        it('should put accepted flag for the edge', () => {
            const state = GraphReducer(linkedState(), actions.acceptEdge(['node1', 'node2']));

            expect(state.graph?.getEdgeAttribute('node1', 'node2', 'meta.rendering_properties.accepted')).toEqual(true);
        });
    });

    describe('AddEdge', () => {
        it('should add the new edge to the graphs set of edges', () => {
            const state = GraphReducer(initialState(), actions.addEdge(['node1', 'node2']));
            expect(state.graph?.edges().length).toEqual(1);
            expect(state.graph?.edge('node1', 'node2')).toBeDefined();
        });

        it('should add -- symbol in PAG mode', () => {
            const modifiedState = initialState();
            modifiedState.graph.addEdge('node1', 'node2', DEFAULT_EDGE);
            modifiedState.editorMode = EditorMode.PAG_VIEWER;

            const state = GraphReducer(modifiedState, actions.addEdge(['node2', 'node1']));

            expect(state.graph?.getEdgeAttribute('node2', 'node1', 'edge_type')).toEqual(EdgeType.UNDIRECTED_EDGE);
        });
        it('should add -> symbol in RESOLVER mode', () => {
            const modifiedState = initialState();
            modifiedState.graph.addEdge('node1', 'node2', DEFAULT_EDGE);
            modifiedState.editorMode = EditorMode.RESOLVER;

            const state = GraphReducer(modifiedState, actions.addEdge(['node2', 'node1']));
            expect(state.graph?.getEdgeAttribute('node2', 'node1', 'edge_type')).toEqual(EdgeType.DIRECTED_EDGE);
        });
        it('should add -> symbol if graph is a Dag and editor mode is undefined', () => {
            const modifiedState = initialState();
            modifiedState.graph.addEdge('node1', 'node2', DEFAULT_EDGE);

            const state = GraphReducer(modifiedState, actions.addEdge(['node2', 'node1']));
            expect(state.graph?.getEdgeAttribute('node2', 'node1', 'edge_type')).toEqual(EdgeType.DIRECTED_EDGE);
        });
        it('should add -- symbol if graph is not a Dag and editor mode is undefined', () => {
            const modifiedState = dagInitialState();
            modifiedState.graph.addEdge('node1', 'node4', DEFAULT_EDGE);

            const state = GraphReducer(modifiedState, actions.addEdge(['node2', 'node1']));
            expect(state.graph?.getEdgeAttribute('node2', 'node1', 'edge_type')).toEqual(EdgeType.DIRECTED_EDGE);
        });
        it('should leave the existing edges intact', () => {
            const modifiedState = initialState();
            modifiedState.graph.addNode('node3', DEFAULT_NODE('node3'));
            modifiedState.graph.addEdge('node1', 'node3', DEFAULT_EDGE);

            const state1 = GraphReducer(modifiedState, actions.addEdge(['node1', 'node2']));
            expect(state1.graph?.getEdgeAttributes('node1', 'node3')).toEqual(DEFAULT_EDGE);
        });
    });

    describe('AddLatentNode', () => {
        it('should check all the existing nodes that are latent (e.g. L1, L2, etc) and add the next one', () => {
            const state = GraphReducer(initialState(), actions.addLatentNode({ x: 0, y: 0 }));
            expect(state.graph?.nodes()).toEqual(['node1', 'node2', 'L0']);

            const state2 = GraphReducer(state, actions.addLatentNode({ x: 0, y: 0 }));
            expect(state2.graph?.nodes()).toEqual(['node1', 'node2', 'L0', 'L1']);
        });
        it('should deal with deleted latent nodes', () => {
            const modifiedState = initialState();
            modifiedState.graph.addNode('L1', DEFAULT_LATENT_NODE('L1'));
            modifiedState.graph.addNode('L5', DEFAULT_LATENT_NODE('L5'));
            const state = GraphReducer(modifiedState, actions.addLatentNode({ x: 0, y: 0 }));
            expect(state.graph?.nodes()).toEqual(['node1', 'node2', 'L1', 'L5', 'L6']);
        });
    });
    describe('RenameNode', () => {
        it('should add label property if not present', () => {
            const state = GraphReducer(initialState(), actions.renameNode('node1', 'LABEL'));

            expect(state.graph?.getNodeAttribute('node1', 'meta.rendering_properties.label')).toEqual('LABEL');
        });
        it('should update label property if present', () => {
            const modifiedState = initialState();
            modifiedState.graph.setNodeAttribute('node1', 'meta.rendering_properties.label', 'LABEL');
            const state = GraphReducer(modifiedState, actions.renameNode('node1', 'NEW LABEL'));

            expect(state.graph?.getNodeAttribute('node1', 'meta.rendering_properties.label')).toEqual('NEW LABEL');
        });
    });
    describe('RemoveEdge', () => {
        it('should remove an edge if it exists', () => {
            const state = GraphReducer(linkedState(), actions.removeEdge(['node1', 'node2']));
            expect(state.graph.edges().length).toEqual(0);
        });
    });
    describe('ReverseEdge', () => {
        it('should remove previous edge and add a new reversed one', () => {
            const state = GraphReducer(linkedState(), actions.reverseEdge(['node1', 'node2']));

            expect(state.graph.edges().length).toEqual(1);
            expect(state.graph.edge('node2', 'node1')).toBeDefined();
        });
    });
    describe('RemoveNode', () => {
        it('should remove a node and clean up any edges that are attached to it', () => {
            const modifiedState = linkedState();
            modifiedState.graph.addNode('node3', DEFAULT_NODE('node3'));
            modifiedState.graph.addEdge('node2', 'node3', DEFAULT_EDGE);
            const state = GraphReducer(modifiedState, actions.removeNode('node2'));
            expect(state.graph.edges().length).toEqual(0);
            expect(state.graph?.nodes()).toEqual(['node1', 'node3']);
        });
    });
});
