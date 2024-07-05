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
import shortid from 'shortid';

export const NODE = 'node';
export const DEFAULT_NODE_SIZE = 75;

export enum NewLayerPosition {
    TOP,
    BOTTOM,
}

export interface NodeSizeProp {
    $nodeSize?: number;
}

/**
 * Node metadata
 */
export interface NodeMeta {
    /**
     * Alternative display label
     */
    label?: string;
    /**
     * Font size to use
     */
    label_size?: number;
    /**
     * Tooltip to display on node hover
     */
    tooltip?: string | Record<string, string>;
    /**
     * Override the wrap text setting per-node
     */
    wrap_text?: boolean;
}

/**
 * Base NodeHierarchyBuilder Node representation - can be accepted as an input
 */
export interface Node {
    meta?: NodeMeta;
    name: string;
}

/**
 * Internal node representation
 */
export interface NodeItem extends Node {
    /**
     * Internal ID to identify the node
     */
    id: string;
    /**
     * Selection status based on search
     */
    selected: boolean; // selection status based on search
}

/**
 * Node representation with current index within its layer attached, used when sending data using drag&drop
 */
export interface DragItem extends NodeItem {
    index: number;
}

/**
 * Layer representation with an internal ID
 */
export interface LayerItem {
    id: string;
    /** Custom label */
    label?: string;
    nodes: NodeItem[];
}

/**
 * Parse a list of lists of nodes into Objects with IDs for easier internal handling
 *
 * @param nodes nodes to parse
 */
export function parseNodes(nodes: Array<Array<string | Node>>): LayerItem[] {
    return nodes.map((layer) => ({
        id: shortid.generate(),
        nodes: layer.map((node) => {
            return {
                ...(typeof node === 'object' ? node : { name: node }),
                id: shortid.generate(),
                selected: false,
            };
        }),
    }));
}

/**
 * Parse list of layer objects back into a list of lists of nodes
 *
 * @param layerItems layer items to parse
 */
export function parseLayerItems(layerItems: LayerItem[], returnStrings: true): Array<Array<string>>;
export function parseLayerItems(layerItems: LayerItem[], returnStrings: false): Array<Array<Node>>;
export function parseLayerItems(layerItems: LayerItem[], returnStrings = false): Array<Array<string | Node>> {
    return layerItems.map((layer) =>
        layer.nodes.filter(Boolean).map((node) => {
            if (returnStrings) {
                return node.name;
            }

            const { id, selected, ...rest } = node;

            return rest;
        })
    );
}

/**
 * Check whether a given string matches a given query.
 *
 * @param string string to check against the query
 * @param query query to check the string against
 */
export function matchesQuery(string: any, query: string): boolean {
    return query !== '' && String(string).toLowerCase().includes(query);
}

/**
 * Check if a given element is currently in view, given its inside a scrollable container.
 *
 * @param element element to check
 * @param scrollableElement scrollable container element
 */
export function isInView(element: HTMLDivElement, scrollableElement: HTMLDivElement): boolean {
    const containerTop = scrollableElement.scrollTop;
    const containerBottom = scrollableElement.clientHeight + containerTop;

    const elementTop = element.offsetTop;
    const elementBottom = elementTop + element.clientHeight;

    // Whether is fully in view
    const isTotal = elementTop >= containerTop && elementBottom <= containerBottom;

    // If first condiiton is met don't evaluate the second one
    if (isTotal) {
        return true;
    }

    // Whether is partially in view
    return (
        (elementTop < containerTop && elementBottom > containerBottom) ||
        (elementTop > containerTop && elementBottom < containerBottom)
    );
}
