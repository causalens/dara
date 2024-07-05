import { GraphActionCreators, GraphReducer } from '../src/shared/causal-graph-store';
import { causalGraphParser } from '../src/shared/parsers';
import { causalGraphSerializer } from '../src/shared/serializer';
import { CausalGraph, CausalGraphEdge, EdgeType, EditorMode } from '../src/types';
import { MockCausalGraphWithExtras } from './mocks/extras-graph';
import { MockCausalGraph } from './utils';

const getExpectedNodes = (mockCausalGraph: CausalGraph): Record<string, any> => {
    return Object.keys(mockCausalGraph.nodes).reduce((acc, key) => {
        acc[key] = {
            ...mockCausalGraph.nodes[key],
            meta: {
                ...mockCausalGraph.nodes[key].meta,
                rendering_properties: {
                    ...mockCausalGraph.nodes[key].meta.rendering_properties,
                    latent: false,
                },
            },
        };

        return acc;
    }, {});
};

const getExpectedEdges = (mockCausalGraph: CausalGraph): Record<string, Record<string, CausalGraphEdge>> => {
    const expectedNodes = getExpectedNodes(mockCausalGraph);
    return Object.keys(mockCausalGraph.edges).reduce((acc, sourceKey) => {
        const nestedEdges = Object.keys(mockCausalGraph.edges[sourceKey]).reduce((nestedAcc, targetKey) => {
            nestedAcc[targetKey] = {
                ...mockCausalGraph.edges[sourceKey][targetKey],
                destination: expectedNodes[targetKey],
                meta: {
                    ...mockCausalGraph.edges[sourceKey][targetKey].meta,
                    rendering_properties: {
                        ...mockCausalGraph.edges[sourceKey][targetKey].meta.rendering_properties,
                    },
                },
                source: expectedNodes[sourceKey],
            };

            return nestedAcc;
        }, {});
        acc[sourceKey] = nestedEdges;

        return acc;
    }, {} as Record<string, Record<string, CausalGraphEdge>>);
};

describe('CausalGraphSerializer', () => {
    it('should serialize the structure back to the original', () => {
        const parsedGraph = causalGraphParser(MockCausalGraph);

        // Latent property is added so expectation has to be adjusted
        const expectedNodes = getExpectedNodes(MockCausalGraph);

        const expectedEdges = getExpectedEdges(MockCausalGraph);

        // The one backwards edge needs to be swapped
        expectedEdges.target1 = {};
        expectedEdges.target1.input2 = expectedEdges.input2.target1;
        delete expectedEdges.input2.target1;
        expectedEdges.target1.input2.edge_type = EdgeType.DIRECTED_EDGE;

        expect(causalGraphSerializer({ graph: parsedGraph })).toEqual({
            edges: expectedEdges,
            nodes: expectedNodes,
            version: MockCausalGraph.version,
        });
    });

    it('should serialize the structure containing extras back to the original', () => {
        const mockCausalGraph = MockCausalGraphWithExtras as CausalGraph;
        const parsedGraph = causalGraphParser(mockCausalGraph);

        // Latent property is added so expectation has to be adjusted
        const expectedNodes = getExpectedNodes(mockCausalGraph);

        const expectedEdges = getExpectedEdges(mockCausalGraph);

        expect(causalGraphSerializer({ graph: parsedGraph })).toEqual({
            defaults: MockCausalGraphWithExtras.defaults,
            edges: expectedEdges,
            nodes: expectedNodes,
            version: MockCausalGraphWithExtras.version,
        });
    });
});

const actions = GraphActionCreators;

describe('Update extra metadata', () => {
    it('should serialize metadata after updating a node', () => {
        const parsedGraph = causalGraphParser(MockCausalGraph);
        const state = GraphReducer(
            { editorMode: EditorMode.DEFAULT, graph: parsedGraph },
            actions.updateNode('input1', { meta: { extra_meta: 'extra_meta' } })
        );

        expect(causalGraphSerializer({ graph: state.graph }).nodes.input1.meta).toMatchInlineSnapshot(`
            {
              "extra_meta": "extra_meta",
              "original": "metadata",
              "rendering_properties": {
                "label": "input1 label",
                "latent": false,
              },
            }
        `);
    });
    it('should serialize metadata for an updated edge', () => {
        const parsedGraph = causalGraphParser(MockCausalGraph);
        const state = GraphReducer(
            { editorMode: EditorMode.DEFAULT, graph: parsedGraph },
            actions.updateEdge(['input1', 'target2'], { meta: { extra_meta: 'extra_meta' } })
        );

        expect(causalGraphSerializer({ graph: state.graph }).edges.input1.target2.meta).toMatchInlineSnapshot(`
            {
              "extra_meta": "extra_meta",
              "original": "metadata",
              "rendering_properties": {
                "color": "#7510F7",
                "thickness": 10,
              },
            }
        `);
    });
});

describe('Edge source/destination', () => {
    it('should populate edge source/destination after removing and adding an edge', () => {
        const parsedGraph = causalGraphParser(MockCausalGraph);
        const initialState = GraphReducer(
            { editorMode: EditorMode.DEFAULT, graph: parsedGraph },
            actions.removeEdge(['input1', 'target1'])
        );
        const state = GraphReducer(initialState, actions.addEdge(['input1', 'target1']));

        const expectedEdges = getExpectedEdges(MockCausalGraph);
        const serializedGraph = causalGraphSerializer({ graph: state.graph });

        expect(serializedGraph.edges.input1.target1).toEqual(expectedEdges.input1.target1);
    });
});
