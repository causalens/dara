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
import { useDrag } from 'react-dnd';

import styled, { useTheme } from '@darajs/styled-components';
import { Tooltip } from '@darajs/ui-components';

import { getTooltipContent } from '../shared/utils';
import { DEFAULT_NODE_SIZE, DragItem, NODE, NodeItem, NodeSizeProp } from './shared';

const NodeCircle = styled.div<NodeSizeProp & { $isDragging?: boolean; $isMatch: boolean; $viewOnly?: boolean }>`
    cursor: ${(props) => {
        if (props.$viewOnly) {
            return 'inherit';
        }

        return props.$isDragging ? 'grabbing' : 'grab';
    }};

    transform: translate(0, 0);

    display: flex;
    align-items: center;
    justify-content: center;

    width: ${(props) => `${props.$nodeSize ?? DEFAULT_NODE_SIZE}px`};
    height: ${(props) => `${props.$nodeSize ?? DEFAULT_NODE_SIZE}px`};
    padding: 1rem;

    color: ${(props) => props.theme.colors.text};

    opacity: ${(props) => (props.$isDragging ? 0.8 : 1)};
    background-color: ${(props) => props.theme.colors.blue4};
    filter: drop-shadow(0 0 2px rgb(0 0 0 / 40%));
    border-color: ${(props) => props.theme.colors.primary};
    border-style: solid;
    border-width: ${(props) => (props.$isMatch ? '4px' : '1px')};
    border-radius: 50%;

    &:hover {
        filter: drop-shadow(0 0 4px rgb(0 0 0 / 40%));
    }
`;

const NodeText = styled.span<{ $labelSize?: number; $wrapNodeText?: boolean }>`
    ${(props) =>
        props.$wrapNodeText ?
            `
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
        overflow-wrap: anywhere;
    `
        :   `
        text-overflow: ellipsis;
        white-space: nowrap;
    `};
    user-select: none;
    overflow: hidden;
    font-size: ${(props) => (props.$labelSize ? `${props.$labelSize}px` : props.theme.font.size)};
`;

interface NodeProps {
    /** Index of the node  */
    index: number;
    /** Node to render */
    node: NodeItem;
    /** Optional node font size */
    nodeFontSize?: number;
    /** Optional node size */
    nodeSize?: number;
    /** Don't allow edits to be made */
    viewOnly?: boolean;
    /** Optional whether to wrap text within nodes */
    wrapNodeText?: boolean;
}

/**
 * The Node component represents a single Node circle which can be dragged between layers and within them
 */
function Node(props: NodeProps): JSX.Element {
    const theme = useTheme();
    const [{ isDragging }, dragRef] = useDrag({
        canDrag: !props.viewOnly,
        collect: (monitor) => ({
            isDragging: !!monitor.isDragging(),
        }),
        item: (): DragItem => ({
            ...props.node,
            index: props.index,
        }),
        type: NODE,
    });

    return (
        <Tooltip
            content={getTooltipContent(props.node?.name, props.node?.meta?.tooltip, theme, props.node?.meta?.label)}
        >
            <NodeCircle
                $isDragging={isDragging}
                $isMatch={props.node.selected}
                $nodeSize={props.nodeSize}
                $viewOnly={props.viewOnly}
                ref={dragRef}
            >
                <NodeText
                    $labelSize={props.node?.meta?.label_size ?? props.nodeFontSize}
                    $wrapNodeText={props.node?.meta?.wrap_text ?? props.wrapNodeText}
                >
                    {props.node?.meta?.label ?? props.node.name}
                </NodeText>
            </NodeCircle>
        </Tooltip>
    );
}

export default Node;
