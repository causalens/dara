import cloneDeep from 'lodash/cloneDeep';

import { causalGraphParser } from '../src/shared/parsers';
import { serializeGraphEdge, serializeGraphNode } from '../src/shared/serializer';
import { CausalGraph, CausalGraphNode, EdgeType } from '../src/types';
import { MockCausalGraphWithExtras, MockTimeSeriesCausalGraph } from './mocks/extras-graph';
import { MockCausalGraph } from './utils';

describe('CausalGraphParser', () => {
    it('should parse a causal graph in a lossless fashion', () => {
        const parsedGraph = causalGraphParser(MockCausalGraph);
        expect(parsedGraph.nodes()).toEqual(Object.keys(MockCausalGraph.nodes));

        // Default = dag mode
        expect(parsedGraph.type).toEqual('directed');

        // check parse-serialize is lossless
        parsedGraph.forEachEdge((id, attrs, source, target) => {
            const expectedEdge = cloneDeep(MockCausalGraph.edges[source][target]);

            // Add rendering properties
            if (Object.keys(expectedEdge.meta).length === 0) {
                expectedEdge.meta.rendering_properties = {};
            }

            if (expectedEdge.edge_type === EdgeType.BACKWARDS_DIRECTED_EDGE) {
                expectedEdge.edge_type = EdgeType.DIRECTED_EDGE;
                // Flip backwards edge source/destination
                const temp = expectedEdge.destination;
                expectedEdge.destination = expectedEdge.source;
                expectedEdge.source = temp;
            }

            expect(serializeGraphEdge(attrs, MockCausalGraph.nodes[source], MockCausalGraph.nodes[target])).toEqual(
                expectedEdge
            );
        });

        parsedGraph.forEachNode((id, attrs) => {
            const expectedNode = cloneDeep(MockCausalGraph.nodes[id]);

            if (!expectedNode.meta.rendering_properties) {
                expectedNode.meta.rendering_properties = {};
            }
            // No available inputs provided - all nodes are not latent
            expectedNode.meta.rendering_properties.latent = false;

            expect(serializeGraphNode(attrs)).toEqual(expectedNode);
        });
    });

    it('should check that extras in graph are parsed correctly', () => {
        const parsedGraph = causalGraphParser(MockCausalGraphWithExtras as CausalGraph);

        const { defaults, edges, nodes } = MockCausalGraphWithExtras;

        // Checks that the extras are parsed correctly to Nodes
        for (const node of parsedGraph.nodes()) {
            expect(parsedGraph.getNodeAttributes(node).extras).toEqual({
                erased: nodes[node].erased,
                identifier: nodes[node].identifier,
                redacted: nodes[node].redacted,
            });
        }

        // Checks that the extras are parsed correctly to Edges
        parsedGraph.edges().forEach((edge, index) => {
            // list all the edge source nodes
            const edgesKeys = Object.keys(edges);
            // based on the index of parsedGraph edge get the corresponding source node
            const edgeAttributes = edges[edgesKeys[index]];
            // get the target node of the edge
            const targetNode = Object.keys(edgeAttributes)[0];
            // get the extra "erased" of the target node
            const { erased } = edgeAttributes[targetNode];

            expect(parsedGraph.getEdgeAttributes(edge).extras).toEqual({
                destination: edgeAttributes[targetNode].destination,
                erased,
                source: edgeAttributes[targetNode].source,
            });
        });

        // Check that any extras in top level go to base extras
        expect(parsedGraph.getAttributes().extras).toEqual({ defaults });
    });

    it('should check that for TimeSeriesCausalGraph an attribute for layering is added', () => {
        const parsedGraph = causalGraphParser(MockTimeSeriesCausalGraph as CausalGraph);

        const { nodes } = MockTimeSeriesCausalGraph;

        // group nodes by variable name
        const groupedByVariableName: Record<string, Array<CausalGraphNode>> = Object.values(nodes).reduce(
            (acc, node) => {
                acc[node.variable_name] = acc[node.variable_name] || [];
                acc[node.variable_name].push(node);
                return acc;
            },
            {}
        );

        // get a list of node names that share a variable_name
        const identifiersOfDuplicates = Object.values(groupedByVariableName)
            .filter((group: CausalGraphNode[]) => group.length > 1)
            .flatMap((group: CausalGraphNode[]) => group.map((obj: CausalGraphNode) => obj.identifier));

        // check that the time_series_variable attribute is added to the nodes that share a variable_name
        identifiersOfDuplicates.forEach((id) => {
            const variableName = parsedGraph.getNodeAttributes(id).extras?.variable_name;
            expect(parsedGraph.getNodeAttributes(id).extras?.time_series_variable).toEqual(variableName);
        });

        // get a list of node names that do not share a variable_name
        const identifiersOfSingles = Object.values(groupedByVariableName)
            .filter((group: CausalGraphNode[]) => group.length === 1)
            .flatMap((group: CausalGraphNode[]) => group.map((obj: CausalGraphNode) => obj.identifier));

        // check that the time_series_variable attribute is not added to the nodes that do not share a variable_name
        identifiersOfSingles.forEach((id) => {
            expect(parsedGraph.getNodeAttributes(id).extras?.time_series_variable).toBeUndefined();
        });
    });

    it('should mark latent nodes when available inputs is present', () => {
        // input1 is an input
        const parsedGraph = causalGraphParser(MockCausalGraph, ['input1']);

        const expectedLatentNodes = ['input2'];
        parsedGraph.forEachNode((id, attrs) => {
            expect(attrs['meta.rendering_properties.latent']).toEqual(expectedLatentNodes.includes(id));
        });
    });
});
