import { type CausalGraph, type CausalGraphEdge, type CausalGraphNode, EdgeType, VariableType } from '../../src/types';

type CausalGraphNodeInput = Partial<Omit<CausalGraphNode, 'identifier'>>;
type CausalGraphEdgeInput = Partial<Omit<CausalGraphEdge, 'destination' | 'source'>>;

export interface CausalGraphInput {
    edges: Record<string, Record<string, CausalGraphEdgeInput>>;
    extras?: Record<string, any>;
    nodes: Record<string, CausalGraphNodeInput>;
    version?: string;
}

/**
 * Completes concise graph fixtures with the identifiers, endpoint references, and defaults required by the runtime model.
 */
export function completeCausalGraph(input: CausalGraphInput): CausalGraph {
    const nodes: Record<string, CausalGraphNode> = {};

    for (const [identifier, node] of Object.entries(input.nodes)) {
        nodes[identifier] = {
            identifier,
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
            ...node,
        };
    }

    const getNode = (identifier: string): CausalGraphNode => {
        const node = nodes[identifier];

        if (!node) {
            throw new Error(`Missing graph node: ${identifier}`);
        }

        return node;
    };

    const edges: Record<string, Record<string, CausalGraphEdge>> = {};

    for (const [source, destinations] of Object.entries(input.edges)) {
        edges[source] = {};

        for (const [destination, edge] of Object.entries(destinations)) {
            edges[source][destination] = {
                destination: getNode(destination),
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: {},
                source: getNode(source),
                ...edge,
            };
        }
    }

    return {
        ...input,
        edges,
        nodes,
        version: input.version ?? '2.0',
    };
}
