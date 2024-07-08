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
import { XYPosition } from 'graphology-layout/utils';
import AbstractGraph from 'graphology-types';

/**
 * Defines 'modes' that the viewer can run in
 */
export enum EditorMode {
    /**
     * Standard causalgraph DAG viewer mode
     */
    DEFAULT = 'DEFAULT',
    /**
     * Domain knowledge editor, input/output is a list of constraints and the graph structure serves for visualisation
     */
    EDGE_ENCODER = 'EDGE_ENCODER',
    /**
     * Like default but displays all edge types (PAG mode)
     */
    PAG_VIEWER = 'PAG',
    /**
     * Resolvera mode essentially does the job of both PAG, CAUSAL_GRAPH editors, taking in EDGE_ENCODER domain knowledge
     * Operates on a structure with additional PAG symbols, 'forced' and 'accepted' flags in meta.
     * Uses simplified UI - intended for business user
     */
    RESOLVER = 'RESOLVER',
}

/**
 * Prefix types in an object with `meta.rendering_properties`
 */
type RenderingMetaKeys<T> = {
    [K in keyof T as K extends string ? `meta.rendering_properties.${K}` : never]: T[K];
};

export interface EdgeRenderingMeta {
    accepted?: boolean;
    color?: string;
    description?: string;
    forced?: boolean;
    thickness?: number;
    tooltip?: string | Record<string, string>;
    collapsedEdgesCount?: number;
}

export type FlatEdgeRenderingMeta = RenderingMetaKeys<EdgeRenderingMeta>;

export interface NodeRenderingMeta {
    color?: string;
    highlight_color?: string;
    label?: string;
    label_color?: string;
    label_size?: number;
    latent?: boolean;
    size?: number;
    tooltip?: string | Record<string, string>;

    // Optional predefined positions
    x?: number;
    y?: number;
}

export type FlatNodeRenderingMeta = RenderingMetaKeys<NodeRenderingMeta>;

export interface CausalGraphNodeMeta {
    [key: string]: any;
    rendering_properties?: NodeRenderingMeta;
}

export interface CausalGraphEdgeMeta {
    [key: string]: any;
    rendering_properties?: EdgeRenderingMeta;
}

/** Target structure for parsers/serialisers */
export interface CausalGraph {
    edges: Record<string, Record<string, CausalGraphEdge>>;
    extras?: Record<string, any>;
    nodes: Record<string, CausalGraphNode>;
    version: string;
}

export interface CausalGraphNode {
    extras?: Record<string, any>;
    identifier: string;
    meta: CausalGraphNodeMeta;
    node_class?: string;
    variable_type: string;
}

export interface CausalGraphEdge {
    destination: CausalGraphNode;
    edge_type: EdgeType;
    extras?: Record<string, any>;
    meta: CausalGraphEdgeMeta;
    source: CausalGraphNode;
}

export enum VariableType {
    BINARY = 'binary',
    CONTINUOUS = 'continuous',
    MULTICLASS = 'multiclass',
    ORDINAL = 'ordinal',
    UNSPECIFIED = 'unspecified',
}

export enum EdgeType {
    /**
     * This is only used internally as a temporary representation in PAG mode, should be reversed
     * in the serialised output.
     */
    BACKWARDS_DIRECTED_EDGE = '<-',
    BIDIRECTED_EDGE = '<>',
    DIRECTED_EDGE = '->',
    UNDIRECTED_EDGE = '--',
    UNKNOWN_DIRECTED_EDGE = 'o>',
    UNKNOWN_EDGE = 'oo',
    UNKNOWN_UNDIRECTED_EDGE = 'o-',
}

export interface GraphState {
    /** Mode editor is in - set by INIT action */
    editorMode?: EditorMode;
    /** Graphology.Graph holding current state */
    graph?: SimulationGraph;
    /** Whether new nodes require a position */
    newNodesRequirePosition?: boolean;
    /** List of removed nodes that can be restored */
    restorableNodes?: SimulationNode[];
}

export type NodeCategory = 'latent' | 'target' | 'other';

export interface SimulationNode extends FlatNodeRenderingMeta {
    /** extra properties of a node */
    extras?: Record<string, any>;
    /** Whether node is currently hovered */
    hovered?: boolean;
    /** The node id */
    id: string;
    /** The original meta information of the node */
    originalMeta: CausalGraphNodeMeta;
    /** The node size,  some layouts need the node size on the node data itself */
    size?: number;

    variable_type: string;
    /** The velocity in the x-axis of the node */
    vx?: number;
    /** The velocity in the y-axis of the node */
    vy?: number;
    /** The x coordinate of the node */
    x?: number;
    /** The y coordinate of the node */
    y?: number;
}

/** Node data with type injected */
export type SimulationNodeWithCategory = SimulationNode & { category: NodeCategory };

export interface SimulationEdge extends FlatEdgeRenderingMeta {
    /** Thetype of the edge */
    edge_type: EdgeType;
    /** Any extra properties of the edge */
    extras?: Record<string, any>;
    /** Original meta information of that edge */
    originalMeta: CausalGraphEdgeMeta;

    /**  optional list of positions the edge should be curved through */
    points?: XYPosition[];
    /** The edge id */
    id?: string;
}

/**
 * D3 variant of edge data, requires putting references to source and target
 */
export interface D3SimulationEdge extends SimulationEdge {
    source: SimulationNodeWithCategory;
    target: SimulationNodeWithCategory;
}

export interface SimulationAttributes {
    extras?: Record<string, any>;
    /**
     * Generic node size param based on layout; can be used for layout approximation
     */
    size?: number;
    uid?: string;
    version: string;
}
export type SimulationGraph = AbstractGraph<SimulationNode, SimulationEdge, SimulationAttributes>;

/**
 * Type of an edge constraint that can be encoded
 *
 * str values from cai_causal_graph.EdgeConstraint
 */
export enum EdgeConstraintType {
    FORBIDDEN = 'forbidden',
    HARD_DIRECTED = 'hard_directed',
    SOFT_DIRECTED = 'soft_directed',
    UNDIRECTED = 'hard_undirected',
}

/**
 * Encodes domain-knowledge as edge constraint
 */
export interface EdgeConstraint {
    extras?: Record<string, any>;
    source: string;
    target: string;
    type: EdgeConstraintType;
}

/**
 * Internal representation of an edge constraint that includes an internal ID
 */
export interface EdgeConstraintItem extends EdgeConstraint {
    id: string;
}

export enum PagSymbol {
    ARROW = 'ARROW',
    CIRCLE = 'CIRCLE',
    EMPTY = 'EMPTY',
}

export const headSymbolMap: Record<string, PagSymbol> = {
    '-': PagSymbol.EMPTY,
    '>': PagSymbol.ARROW,
    o: PagSymbol.CIRCLE,
};

export const tailSymbolMap: Record<string, PagSymbol> = {
    '-': PagSymbol.EMPTY,
    '<': PagSymbol.ARROW,
    o: PagSymbol.CIRCLE,
};

/**
 * Parse a PAG symbol (i.e. 'ARROW') into its string representation ('>')
 */
export function symbolToString(symbol: PagSymbol, position: 'head' | 'tail'): string {
    const symbolMap = position === 'head' ? headSymbolMap : tailSymbolMap;
    for (const [key, val] of Object.entries(symbolMap)) {
        if (val === symbol) {
            return key;
        }
    }

    throw new Error(`Unrecognised symbol: ${symbol}`);
}

/**
 * Parse a PAG string ('>') into its symbol ('ARROW')
 */
export function stringToSymbol(string: string, position: 'head' | 'tail'): PagSymbol {
    const symbolMap = position === 'head' ? headSymbolMap : tailSymbolMap;

    if (symbolMap[string]) {
        return symbolMap[string];
    }

    throw new Error(`Unrecognised symbol: ${string}`);
}

/**
 * Defines minimum scale at which a given element should be rendered
 * Should be a number larger than 0 (most likely between 0-1)
 */
export interface ZoomThresholds {
    edge: number;
    label: number;
    shadow: number;
    symbol: number;
}

export type ZoomState = Record<keyof ZoomThresholds, boolean>;

export type DirectionType = 'horizontal' | 'vertical';

export interface TiersConfig {
    /** The path for the property in the node that should be used for defining their layer */
    group: string;
    /** The path for the property in the node that should be used for defining their order within each layer */
    order_nodes_by?: string;
    /** A list of layer names to define the order in which they appear */
    rank?: string[];
}

export type GraphTiers = string[][] | TiersConfig;

/**
 * Defines necessary properties that need to be implemented by graph layouts to support tiered layouts
 */
export interface TieredGraphLayoutBuilder {
    orientation?: DirectionType;
    tiers: GraphTiers;
}

/**
 * Defines necessary properties that need to be implemented by graph layouts to support grouping/cluster layouts
 */
export interface GroupingLayoutBuilder {
    /** The path for the property in the node that should be used for defining their layer */
    group: string;
}

/**
 * Defines necessary properties for a group node to be drawn on the graph
 */
export interface GroupNode {
    id: string;
    originalMeta: CausalGraphNodeMeta;
    variable_type: 'groupNode';
}
