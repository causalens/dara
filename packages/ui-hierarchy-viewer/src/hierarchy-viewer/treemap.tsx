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
import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState } from 'react';

import styled, { useTheme } from '@darajs/styled-components';
import { useDeepCompare } from '@darajs/ui-utils';

export interface Node {
    children?: Array<Node>;
    id: string;
    label: string;
    weight?: number;
}

interface NodeLabelProps {
    hasChildren: boolean;
    isInteractive: boolean;
}

const NodeLabel = styled.div<NodeLabelProps>`
    cursor: ${(props) => (props.isInteractive ? 'pointer' : 'normal')};

    display: flex;
    align-items: ${(props) => (props.hasChildren ? 'flex-start' : 'center')};
    justify-content: center;

    width: 100%;
    height: 100%;
    padding-top: 4px;

    text-align: center;

    border: 2px solid transparent;

    :hover {
        border: ${(props) =>
            props.isInteractive ? `2px solid ${props.theme.colors.primary}` : '2px solid transparent'};
    }
`;

interface NodeRendererProps {
    allowLeafClick?: boolean;
    allowParentClick?: boolean;
    color: d3.ScaleOrdinal<string, string, never>;
    maxDepth: number;
    node: d3.HierarchyRectangularNode<Node>;
    onClick: (node: Node) => void | Promise<void>;
}

/**
 * The NodeRenderer component is called recursively to render the nodes or a tree map component based on the node passed
 * into it.
 *
 * @param props the component props
 */
function NodeRenderer(props: NodeRendererProps): JSX.Element {
    const { node, onClick: onClickProp } = props;
    const depth = (props.maxDepth - (props.node.depth % 5)).toString();
    const fill = props.color(depth).toString();
    const width = Number.isNaN(node.x1 - node.x0) ? undefined : node.x1 - node.x0;
    const height = Number.isNaN(node.y1 - node.y0) ? undefined : node.y1 - node.y0;
    const hasChildren = node.children && node.children.length > 0;
    const isInteractive = (hasChildren && props.allowParentClick) || (!hasChildren && props.allowLeafClick);

    const onClick = useCallback(() => {
        onClickProp(node.data);
    }, [node, onClickProp]);

    return (
        <>
            <rect
                fill={fill}
                height={height}
                width={width}
                x={node.x0}
                y={Number.isNaN(node.y0) ? undefined : node.y0}
            />
            <foreignObject
                height={height}
                onClick={onClick}
                width={width}
                x={node.x0}
                y={Number.isNaN(node.y0) ? undefined : node.y0}
            >
                <NodeLabel
                    hasChildren={hasChildren}
                    isInteractive={isInteractive}
                    title={`${node.data?.label} (${node.data?.weight})`}
                >
                    <span>{node.data?.label}</span>
                </NodeLabel>
            </foreignObject>
            {node.children &&
                node.children.map((child: any) => (
                    <NodeRenderer
                        allowLeafClick={props.allowLeafClick}
                        allowParentClick={props.allowParentClick}
                        color={props.color}
                        key={child.data?.id}
                        maxDepth={props.maxDepth}
                        node={child}
                        onClick={props.onClick}
                    />
                ))}
        </>
    );
}

interface TreemapProps {
    /** Allow leaf nodes to be clicked */
    allowLeafClick?: boolean;
    /** Allow parent nodes to be clicked */
    allowParentClick?: boolean;
    /** The data that get passed to the component.
     * Each node must contain atleast the label and id while the leaf nodes should contain the weights
     * */
    data: Node;
    /** Component height */
    height: number;
    /** onClick handler for when a node is clicked on */
    onClick: (node: Node) => void | Promise<void>;
    /** Component width */
    width: number;
}

/**
 * The Treemap component that takes the data and converts it into a nested treemap.
 * The component shows a tooltip that shows the weight of the node.
 *
 * @param {TreemapProps} params - the component props
 */
function Treemap(props: TreemapProps): JSX.Element {
    const theme = useTheme();
    const ref = useRef();

    const [treemap, setTreemap] = useState<any>();

    useEffect(
        () => {
            if (props.data) {
                const root = d3.hierarchy(props.data).sum((node) => {
                    return node.children && node.children.length > 0 ? 0 : node.weight;
                });
                d3
                    .treemap()
                    .size([props.width, props.height])
                    .paddingTop(28)
                    .paddingBottom(8)
                    .paddingRight(7)
                    .paddingLeft(7)
                    .paddingInner(3)(root);
                setTreemap(root);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        useDeepCompare([props.data, props.height, props.width])
    );

    const color = d3
        .scaleOrdinal<string>()
        .domain(['0', '1', '2', '3', '4'])
        .range([theme.colors.grey2, theme.colors.grey3, theme.colors.grey4, theme.colors.grey5, theme.colors.grey6]);

    if (!treemap) {
        return null;
    }

    const maxDepth = treemap.leaves() ? treemap.leaves()[0].depth : 0;
    return (
        <svg height={props.height} ref={ref} width={props.width}>
            <NodeRenderer
                allowLeafClick={props.allowLeafClick}
                allowParentClick={props.allowParentClick}
                color={color}
                maxDepth={maxDepth}
                node={treemap}
                onClick={props.onClick}
            />
        </svg>
    );
}

export default Treemap;
