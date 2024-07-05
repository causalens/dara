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
import { ForwardedRef, forwardRef, useCallback, useState } from 'react';
import { useDrop } from 'react-dnd';

import styled, { useTheme } from '@darajs/styled-components';
import { Button, Chevron } from '@darajs/ui-components';
import { TrashAlt } from '@darajs/ui-icons';

import LayerDivider from './layer-divider';
import LayerLabelEditor from './layer-label-editor';
import Node from './node';
import { DEFAULT_NODE_SIZE, DragItem, NODE, NewLayerPosition, NodeItem, NodeSizeProp } from './shared';

const LayerWrapper = styled.div<NodeSizeProp & { $isCollapsed?: boolean; $isOver?: boolean }>`
    position: relative;

    display: flex;
    gap: 1rem;
    align-items: center;
    justify-content: space-between;

    min-height: ${(props) => (props.$isCollapsed ? `${(props.$nodeSize ?? DEFAULT_NODE_SIZE) + 32}px` : 'auto')};
    max-height: ${(props) => (props.$isCollapsed ? `${(props.$nodeSize ?? DEFAULT_NODE_SIZE) + 32}px` : 'auto')};
    padding-right: 2rem;

    background-color: ${(props) => props.$isOver && props.theme.colors.grey2};
`;

const LayerLabel = styled.div<NodeSizeProp>`
    display: flex;
    align-items: center;
    align-self: stretch;
    justify-content: center;

    width: 120px;
    padding: 0 1rem;

    color: ${(props) => props.theme.colors.grey4};
`;

const LayerContent = styled.div`
    display: flex;
    gap: 3rem;
    align-items: center;
    width: 100%;
`;

const MultiRowNodesWrapper = styled.div<{ $nodeNumber: number }>`
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    gap: 0.25rem;
    align-items: center;

    min-width: 0;
    padding: 3rem 0;
`;

const SingleRowNodesWrapper = styled.div<{ $nodeNumber: number }>`
    display: grid;
    grid-template-columns: ${(props) => `repeat(${props.$nodeNumber}, minmax(0, 1fr))`};
    gap: 0.25rem;

    min-width: 0;
    max-width: 85%;
    padding: 2rem 0;
`;

const StyledChevron = styled(Chevron)`
    cursor: pointer;
`;

const SmallButton = styled(Button)`
    width: 28px;
    min-width: 0;
    height: 28px;
    padding: 0 0.25rem;
`;

interface LayerProps {
    /** Layer id */
    id: string;
    /** Whether the layer is the first one */
    isFirst: boolean;
    /** Whether the layer is the only one */
    isOnly: boolean;
    /** Custom tier label */
    label?: string;
    /** Optional node text size in pixels */
    nodeFontSize?: number;
    /** Optional node size in pixels */
    nodeSize?: number;
    /** Nodes within the layer */
    nodes: NodeItem[];
    /** Layer number */
    number: number;
    /** Handler called when a node is added to this layer */
    onAddLayer: (reference: string, position: NewLayerPosition) => void;
    /** Handler called when this layer should be deleted  */
    onDeleteLayer: () => void | Promise<void>;
    /** Handler called upon dropping a node on this layer */
    onDrop: (item: DragItem) => void | Promise<void>;
    /** Handler called when a tier label is updated */
    onUpdateLabel: (id: string, label: string) => void;
    /** Don't allow edits to be made */
    viewOnly?: boolean;
    /** Optional whether to wrap text within nodes */
    wrapNodeText?: boolean;
}

/**
 * The Layer represents one of the layers in the NodeHierarchyBuilder
 */
function Layer(props: LayerProps, ref: ForwardedRef<HTMLDivElement>): JSX.Element {
    const theme = useTheme();
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [{ canDrop, isOver }, dropRef] = useDrop({
        accept: NODE,
        canDrop: (item: DragItem) => {
            return !props.nodes.find((node) => node?.name === item?.name);
        },
        collect: (monitor) => ({
            canDrop: !!monitor.canDrop(),
            isOver: !!monitor.isOver(),
        }),
        drop: (item: DragItem) => {
            props.onDrop(item);
        },
    });

    const NodesWrapper = isCollapsed ? SingleRowNodesWrapper : MultiRowNodesWrapper;

    const onUpdateLabel = useCallback(
        (label: string) => {
            props.onUpdateLabel(props.id, label);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [props.id, props.onUpdateLabel]
    );

    return (
        <LayerWrapper $isCollapsed={isCollapsed} $isOver={isOver && canDrop} $nodeSize={props.nodeSize} ref={dropRef}>
            {props.isFirst && (
                <LayerDivider
                    onClick={() => props.onAddLayer(props.id, NewLayerPosition.TOP)}
                    position="top"
                    viewOnly={props.viewOnly}
                />
            )}
            <LayerContent ref={ref}>
                <LayerLabel $nodeSize={props.nodeSize}>
                    <LayerLabelEditor
                        label={props.label}
                        number={props.number}
                        onChange={onUpdateLabel}
                        viewOnly={props.viewOnly}
                    />
                </LayerLabel>

                <NodesWrapper $nodeNumber={props.nodes.length}>
                    {props.nodes.map(
                        (node, index) =>
                            node && (
                                <Node
                                    index={index}
                                    key={node.id}
                                    node={node}
                                    nodeFontSize={props.nodeFontSize}
                                    nodeSize={props.nodeSize}
                                    viewOnly={props.viewOnly}
                                    wrapNodeText={props.wrapNodeText}
                                />
                            )
                    )}
                </NodesWrapper>
            </LayerContent>
            {props.nodes.length > 0 && (
                <SmallButton onClick={() => setIsCollapsed((bool) => !bool)} styling="ghost">
                    <StyledChevron isOpen={!isCollapsed} />
                </SmallButton>
            )}
            {!props.isOnly && !props.viewOnly && (
                <SmallButton
                    aria-label="Delete Layer"
                    onClick={props.onDeleteLayer}
                    style={{
                        color: theme.colors.error,
                    }}
                    styling="ghost"
                >
                    <TrashAlt />
                </SmallButton>
            )}
            <LayerDivider
                onClick={() => props.onAddLayer(props.id, NewLayerPosition.BOTTOM)}
                viewOnly={props.viewOnly}
            />
        </LayerWrapper>
    );
}

export default forwardRef(Layer);
