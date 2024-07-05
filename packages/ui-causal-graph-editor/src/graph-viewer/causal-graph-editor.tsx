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
import debounce from 'lodash/debounce';
import noop from 'lodash/noop';
import { useEffect, useMemo, useState } from 'react';
import * as React from 'react';
import { GetReferenceClientRect } from 'tippy.js';

import styled, { useTheme } from '@darajs/styled-components';
import { Tooltip } from '@darajs/ui-components';
import { Notification, NotificationPayload } from '@darajs/ui-notifications';
import { Status, useOnClickOutside, useUpdateEffect } from '@darajs/ui-utils';
import { ConfirmationModal } from '@darajs/ui-widgets';

import {
    AddNodeButton,
    CenterGraphButton,
    CollapseExpandButton,
    DragModeButton,
    EdgeInfoContent,
    GraphLegendDefinition,
    Legend,
    NodeInfoContent,
    Overlay,
    RecalculateLayoutButton,
    SearchBar,
    getLegendData,
    useSearch,
} from '@shared/editor-overlay';
import { SaveImageButton } from '@shared/editor-overlay/buttons';
import ZoomPrompt from '@shared/editor-overlay/zoom-prompt';
import { GraphLayoutWithGrouping } from '@shared/graph-layout/common';
import useGraphTooltip from '@shared/use-graph-tooltip';
import { getGroupToNodesMap, getNodeToGroupMap, getTooltipContent, willCreateCycle } from '@shared/utils';

import {
    CausalGraph,
    CausalGraphEdge,
    CausalGraphNode,
    EdgeConstraint,
    EdgeType,
    EditorMode,
    SimulationEdge,
    ZoomThresholds,
} from '@types';

import GraphContext from '../shared/graph-context';
import { GraphLayout } from '../shared/graph-layout';
import PointerContext from '../shared/pointer-context';
import { PixiEdgeStyle } from '../shared/rendering/edge';
import { useRenderEngine } from '../shared/rendering/use-render-engine';
import { causalGraphSerializer, serializeGraphEdge, serializeGraphNode } from '../shared/serializer';
import { Settings, SettingsProvider } from '../shared/settings-context';
import { Center, Graph, Wrapper } from '../shared/styles';
import useCausalGraphEditor from '../shared/use-causal-graph-editor';
import useDragMode from '../shared/use-drag-mode';
import { useEdgeConstraintEncoder } from '../shared/use-edge-encoder';
import useIterateEdges from './utils/use-iterate-edges';
import useIterateNodes from './utils/use-iterate-nodes';

const NotificationWrapper = styled.div`
    position: relative;
    z-index: 100;
    top: calc(100% - 8rem);
    left: calc(100% - 23rem);

    height: 0;

    div {
        align-items: center;
        height: 7rem;
        padding: 0.75rem;
    }

    span {
        flex-grow: 1;

        -webkit-line-clamp: 3;
    }

    h2 {
        align-self: baseline;
        height: 1.6rem;
    }
`;

const GraphPane = styled.div<{ $hasFocus: boolean }>`
    position: relative;
    z-index: 1;

    display: flex;
    flex: 1 1 auto;
    flex-direction: column;

    /* We set a minHeight so that at least some of the graph will always appear within the container */
    min-height: 100px;

    border: 2px solid transparent;
    border-color: ${(props) => (props.$hasFocus ? props.theme.colors.grey3 : 'transparent')};
    border-radius: 6px;
    box-shadow: ${(props) => (props.$hasFocus ? props.theme.shadow.light : 'none')};
`;

export interface CausalGraphEditorProps extends Settings {
    /** Optional additional legends to show */
    additionalLegends?: GraphLegendDefinition[];
    /** Input nodes */
    availableInputs?: string[];
    /** Standard class name prop */
    className?: string;
    /** default legends per editor mode */
    defaultLegends?: Record<EditorMode, GraphLegendDefinition[]>;
    /** Any extra sections to display in the side panel on edge click */
    edgeExtrasContent?: React.ReactElement;
    /** The backend data */
    graphData?: CausalGraph;
    /** Graph layout to use */
    graphLayout: GraphLayout;
    /** Optional initial constraints to show in edge encoder mode */
    initialConstraints?: EdgeConstraint[];
    /** Any extra sections to display in the side panel on node click */
    nodeExtrasContent?: React.ReactElement;
    /** Array of node names that cannot be removed */
    nonRemovableNodes?: Array<string>;
    /** Event handler for clicking on an edge */
    onClickEdge?: (edge: CausalGraphEdge) => void | Promise<void>;
    /** Event handler for clicking on a node */
    onClickNode?: (node: CausalGraphNode) => void | Promise<void>;
    /** Handler called when constraints are update in edge encoder mode */
    onEdgeConstraintsUpdate?: (constraints: EdgeConstraint[]) => void | Promise<void>;
    /** onUpdate handler for live updating the edited graph */
    onUpdate?: (data: CausalGraph) => void | Promise<void>;
    /** Optional handler to process the edge style */
    processEdgeStyle?: (edge: PixiEdgeStyle, attributes: SimulationEdge) => PixiEdgeStyle;
    /** Whether focusing the graph is required before mousewheel zooming is enabled */
    requireFocusToZoom?: boolean;
    /** Optional boolean defining whether a node and an edge can be selected simultaneously */
    simultaneousEdgeNodeSelection?: boolean;
    /** Pass through of the native style prop */
    style?: React.CSSProperties;
    /** Optional parameter to force a tooltip to use a particular font size */
    tooltipSize?: number;
    /** Optional parameter to specify when parts of the graph should be hidden. */
    zoomThresholds?: ZoomThresholds;
}

/**
 * The high level causal graph editor presents causal graphs at a high level for domain experts to view them, without
 * over complicating the view.
 *
 * @param props the component props
 */
function CausalGraphEditor({ requireFocusToZoom = true, ...props }: CausalGraphEditorProps): JSX.Element {
    const theme = useTheme();

    const canvasParentRef = React.useRef<HTMLDivElement>(null);

    const { state, api, layout } = useCausalGraphEditor(
        props.graphData,
        props.editorMode,
        props.graphLayout,
        props.availableInputs
    );

    const [error, setError] = useState(null);
    const handleError = (e: NotificationPayload): void => {
        setError(e);
    };

    const layoutHasGroup = useMemo(() => (layout as GraphLayoutWithGrouping).group !== undefined, [layout]);

    const {
        getCenterPosition,
        useEngineEvent,
        resetViewport,
        collapseGroups,
        expandGroups,
        resetLayout,
        extractImage,
        onSetDragMode,
        onNodeSelected,
        onEdgeSelected,
        onSearchResults,
        onUpdateConstraints,
        onSetFocus,
    } = useRenderEngine({
        constraints: props.initialConstraints,
        editable: props.editable,
        editorMode: state.editorMode,
        errorHandler: handleError,
        graph: state.graph,
        layout,
        parentRef: canvasParentRef,
        processEdgeStyle: props.processEdgeStyle,
        requireFocusToZoom,
        zoomThresholds: props.zoomThresholds,
    });

    const paneRef = React.useRef<HTMLDivElement>(null);
    const [showZoomPrompt, setShowZoomPrompt] = useState(() => {
        // Show the prompt if the user has not dismissed it before
        return localStorage.getItem('showGraphZoomPrompt') !== 'false';
    });

    function onDismiss(): void {
        setShowZoomPrompt(false);
        localStorage.setItem('showGraphZoomPrompt', 'false');
    }

    const [hasFocus, setHasFocus] = useState(false);
    const [showCollapseAll, setShowCollapseAll] = useState(true);

    function onPaneFocus(focus: boolean): void {
        setHasFocus(focus);
        onSetFocus(focus);
    }

    useOnClickOutside(paneRef.current, () => onPaneFocus(false));

    // track selection
    const [selectedEdge, setSelectedEdge] = useState<[string, string]>(null);
    const [selectedNode, setSelectedNode] = useState<string>(null);

    // track node highlighted by search separately
    // this is used instead of selection when there is no concept of selection, i.e. not editable or allowSelectionWhenNotEditable
    const [highlightedNode, setHighlightedNode] = useState<string>();

    useUpdateEffect(() => {
        // Update visual selection when a node is highlighted
        onNodeSelected(highlightedNode);
    }, [highlightedNode]);

    useUpdateEffect(() => {
        // Only tell engine to update styles in editable mode or if we show the panel
        if (props.editable || props.allowSelectionWhenNotEditable) {
            onNodeSelected(selectedNode);
        }

        if (props.onClickNode) {
            let serializedNode: CausalGraphNode = null;

            if (selectedNode) {
                serializedNode = serializeGraphNode(state.graph.getNodeAttributes(selectedNode));
            }

            props.onClickNode(serializedNode);
        }
    }, [selectedNode]);

    useUpdateEffect(() => {
        // Only tell engine to update styles in editable mode or if we show the panel
        if (props.editable || props.allowSelectionWhenNotEditable) {
            onEdgeSelected(selectedEdge);
        }

        if (props.onClickEdge) {
            let serializedEdge: CausalGraphEdge = null;

            if (selectedEdge) {
                const [source, target] = selectedEdge;
                serializedEdge = serializeGraphEdge(
                    state.graph.getEdgeAttributes(source, target),
                    serializeGraphNode(state.graph.getNodeAttributes(source)),
                    serializeGraphNode(state.graph.getNodeAttributes(target))
                );
            }

            props.onClickEdge(serializedEdge);
        }
    }, [selectedEdge]);

    // constraints
    const { constraints, addConstraint, updateConstraint, removeConstraint, reverseConstraint } =
        useEdgeConstraintEncoder(props.initialConstraints, props.onEdgeConstraintsUpdate);

    const selectedConstraint = useMemo(() => {
        if (state.editorMode === EditorMode.EDGE_ENCODER && selectedEdge) {
            const [source, target] = selectedEdge;

            // Find constraint with either matching or reversed source/target
            return constraints.find(
                (c) => (c.source === source && c.target === target) || (c.source === target && c.target === source)
            );
        }
    }, [state.editorMode, selectedEdge, constraints]);

    // deletion

    function onRemoveNode(): void {
        if (layoutHasGroup) {
            const layoutGroup = (layout as GraphLayoutWithGrouping).group;
            const groupsObject = getGroupToNodesMap(state.graph.nodes(), layoutGroup, state.graph);
            const nodesToGroups = getNodeToGroupMap(state.graph.nodes(), layoutGroup, state.graph);
            const group = nodesToGroups[selectedNode];
            if (groupsObject[group]?.length === 1) {
                props.onNotify?.({
                    key: 'delete-group',
                    message: 'Cannot delete the last node in a group',
                    status: Status.WARNING,
                    title: 'Group deletion',
                });
                return;
            }
        }
        api.removeNode(selectedNode);
        setSelectedNode(null);
    }

    function onRemoveConstraint(): void {
        // Remove constraint that's selected
        removeConstraint(selectedConstraint.id);
    }

    function onConfirmRemoveEdge(): void {
        // In encoder mode, remove related constraint
        if (state.editorMode === EditorMode.EDGE_ENCODER) {
            onRemoveConstraint();
        }

        api.removeEdge(selectedEdge);
        setSelectedEdge(null);
    }

    const { onConfirmation: askToRemoveEdge, modalProps: removeEdgeProps } = ConfirmationModal.useConfirmationModal<
        [string, string]
    >(
        (edge) =>
            `You are about to remove the edge: ${edge[0]} -> ${edge[1]} which was forced by prior domain knowledge. Are you sure?`,
        onConfirmRemoveEdge
    );

    function onRemoveEdge(): void {
        const edgeAttributes = state.graph.getEdgeAttributes(...selectedEdge);

        if (edgeAttributes['meta.rendering_properties.forced'] === true) {
            askToRemoveEdge(selectedEdge);
        } else {
            onConfirmRemoveEdge();
        }
    }

    let onDelete: () => void = null;

    if (selectedEdge) {
        onDelete = onRemoveEdge;
    } else if (selectedNode) {
        const disableRemoval = props.disableNodeRemoval || props.nonRemovableNodes?.includes(selectedNode);
        if (!disableRemoval) {
            onDelete = onRemoveNode;
        }
    }

    // other api handlers

    function onAddEdge(edge: [string, string]): void {
        if (layoutHasGroup) {
            const layoutGroup = (layout as GraphLayoutWithGrouping).group;
            const groupsObject = getGroupToNodesMap(state.graph.nodes(), layoutGroup, state.graph);
            const groups = Object.keys(groupsObject);

            if (groups.includes(edge[0]) && groups.includes(edge[1])) {
                props.onNotify?.({
                    key: 'create-edge-group',
                    message: 'Adding edge between groups is not allowed',
                    status: Status.WARNING,
                    title: 'Group edge detected',
                });
                return;
            }
        }
        // Skip if a cycle would be created
        // The check needs to happen before we commit an action
        if (willCreateCycle(state.graph, edge)) {
            props.onNotify?.({
                key: 'create-edge-cycle',
                message: 'Could not create an edge as it would create a cycle',
                status: Status.WARNING,
                title: 'Cycle detected',
            });
            return;
        }

        if (state.editorMode === EditorMode.EDGE_ENCODER) {
            const [source, target] = edge;
            addConstraint(source, target);
        }

        api.addEdge(edge);
        setSelectedNode(null);
        setSelectedEdge(edge);
    }

    function onAddNode(): void {
        const position = getCenterPosition();
        api.addLatentNode(position);
    }

    function onReverseEdge(): void {
        const [source, target] = selectedEdge;

        // Skip if a cycle would be created
        // This creates a clone of the graph without the reversed edge so we can properly check if the reverse would create a cycle
        const graphCopy = state.graph.copy();
        graphCopy.dropEdge(source, target);
        if (willCreateCycle(graphCopy, selectedEdge)) {
            props.onNotify?.({
                key: 'reverse-edge-cycle',
                message: 'Could not reverse the edge as it would create a cycle',
                status: Status.WARNING,
                title: 'Cycle detected',
            });
            return;
        }

        // Reverse the edge
        api.reverseEdge(selectedEdge);

        // Update selection to the new edge
        setSelectedEdge([target, source]);
    }

    function onReverseConstraint(): void {
        setSelectedEdge(null);

        reverseConstraint(selectedConstraint);
    }

    function confirmDirection(reverse: boolean): void {
        api.updateEdgeType(selectedEdge, EdgeType.DIRECTED_EDGE);

        if (reverse) {
            if (state.editorMode === EditorMode.EDGE_ENCODER) {
                onReverseConstraint();
            }

            onReverseEdge();
        }
    }

    const tooltipRef = React.useRef<GetReferenceClientRect>(null);
    const { tooltipContent, setTooltipContent } = useGraphTooltip(paneRef, tooltipRef);

    // keep track of when a drag action is happening
    const [isDragging, setIsDragging] = useState(false);

    // keep track of open panels so we can prevent tooltips from appearing below them
    const [isInPanel, setIsInPanel] = useState(false);

    function onPanelEnter(): void {
        setIsInPanel(true);
    }
    function onPanelExit(): void {
        setIsInPanel(false);
    }

    useEngineEvent('dragStart', () => {
        setIsDragging(true);
    });

    useEngineEvent('dragEnd', () => {
        setIsDragging(false);
    });

    useEngineEvent('nodeMouseover', (event, nodeId) => {
        const nodeAttributes = state.graph.getNodeAttributes(nodeId);
        tooltipRef.current = () =>
            ({
                bottom: event.clientY,
                height: 0,
                left: event.clientX,
                right: event.clientX,
                top: event.clientY,
                width: 0,
            }) as DOMRect;

        setTooltipContent(
            getTooltipContent(
                nodeId,
                nodeAttributes['meta.rendering_properties.tooltip'],
                theme,
                nodeAttributes['meta.rendering_properties.label'],
                props.tooltipSize
            )
        );
    });

    useEngineEvent('nodeMouseout', () => {
        setTooltipContent(null);
    });

    useEngineEvent('edgeMouseover', (event, edgeKey) => {
        const edgeAttributes = state.graph.getEdgeAttributes(edgeKey);
        const sourceNodeKey = state.graph.source(edgeKey);
        const targetNodeKey = state.graph.target(edgeKey);
        const sourceNodeAttributes = state.graph.getNodeAttributes(sourceNodeKey);
        const targetNodeAttributes = state.graph.getNodeAttributes(targetNodeKey);

        const sourceLabel = sourceNodeAttributes['meta.rendering_properties.label'] ?? sourceNodeAttributes.id;
        const targetLabel = targetNodeAttributes['meta.rendering_properties.label'] ?? targetNodeAttributes.id;

        const tooltipArrow = state.editorMode === EditorMode.DEFAULT ? '➜' : '-';

        const edgeTooltipContent = getTooltipContent(
            `${sourceLabel} ${tooltipArrow} ${targetLabel}`,
            edgeAttributes['meta.rendering_properties.tooltip'],
            theme,
            null,
            props.tooltipSize
        );

        tooltipRef.current = () =>
            ({
                bottom: event.clientY,
                height: 0,
                left: event.clientX,
                right: event.clientX,
                top: event.clientY,
                width: 0,
            }) as DOMRect;
        setTooltipContent(edgeTooltipContent);
    });

    useEngineEvent('groupMouseover', (event, groupId) => {
        tooltipRef.current = () =>
            ({
                bottom: event.clientY,
                height: 0,
                left: event.clientX,
                right: event.clientX,
                top: event.clientY,
                width: 0,
            }) as DOMRect;

        setTooltipContent(getTooltipContent(groupId, '', theme));
    });

    useEngineEvent('groupMouseout', () => {
        setTooltipContent(null);
    });

    useEngineEvent('edgeMouseout', () => {
        setTooltipContent(null);
    });

    // Sync state to engine events
    useEngineEvent('backgroundClick', () => {
        setSelectedEdge(null);
        setSelectedNode(null);
    });

    useEngineEvent('nodeClick', (_event, nodeId) => {
        if (!props.simultaneousEdgeNodeSelection) {
            setSelectedEdge(null);
        }
        setSelectedNode(nodeId);
    });

    useEngineEvent('edgeClick', (_event, source, target) => {
        if (!props.simultaneousEdgeNodeSelection) {
            setSelectedNode(null);
        }
        setSelectedEdge([source, target]);
    });

    useEngineEvent('createEdge', (_event, source, target) => {
        onAddEdge([source, target]);
    });

    // Sync state up
    useUpdateEffect(() => {
        onUpdateConstraints(constraints);
    }, [constraints]);

    /** Debouncing the prop in case multiple changes happen at the same time */
    const debouncedOnUpdate = useMemo(
        () => debounce(props.onUpdate ?? noop, 150, { trailing: true }),
        [props.onUpdate]
    );

    const isMounted = React.useRef(false);
    function updateState(): void {
        if (!isMounted.current) {
            return;
        }

        if (props.onUpdate) {
            debouncedOnUpdate(causalGraphSerializer(state));
        }
    }

    const updateStateRef = React.useRef(updateState);
    updateStateRef.current = updateState;

    useEffect(() => {
        updateStateRef.current();

        const updateFunction = (): void => {
            updateStateRef.current();
        };

        // Attach listeners so each graph update will send an update
        state.graph.on('nodeAdded', updateFunction);
        state.graph.on('edgeAdded', updateFunction);
        state.graph.on('edgeDropped', updateFunction);
        state.graph.on('nodeDropped', updateFunction);
        state.graph.on('edgeAttributesUpdated', updateFunction);
        state.graph.on('nodeAttributesUpdated', updateFunction);

        isMounted.current = true;

        return () => {
            state.graph.off('nodeAdded', updateFunction);
            state.graph.off('edgeAdded', updateFunction);
            state.graph.off('edgeDropped', updateFunction);
            state.graph.off('nodeDropped', updateFunction);
            state.graph.off('edgeAttributesUpdated', updateFunction);
            state.graph.off('nodeAttributesUpdated', updateFunction);
        };
    }, [state.graph]);

    // Search
    const { currentSearchNode, onNextSearchResult, onPrevSearchResult, onSearchBarChange, searchResults } = useSearch({
        graph: state.graph,
        // when selection is possible use selectedNode, otherwise use highlightedNode
        setSelectedNode: props.editable || props.allowSelectionWhenNotEditable ? setSelectedNode : setHighlightedNode,
    });
    useEffect(() => {
        onSearchResults(searchResults);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchResults]);

    const [showFrameButtons, setShowFrameButtons] = useState(false);

    function onMouseEnter(): void {
        setShowFrameButtons(true);
    }

    function onMouseLeave(): void {
        setShowFrameButtons(false);
        // ensure tooltip is hidden when mouse leaves
        setTooltipContent(null);
    }

    const { nextNode, prevNode } = useIterateNodes(selectedNode, setSelectedNode, state);
    const { nextEdge, prevEdge } = useIterateEdges(selectedEdge, setSelectedEdge, state);

    function onNext(): void {
        if (selectedNode) {
            nextNode();
        } else if (selectedEdge) {
            nextEdge();
        }
    }

    function onPrev(): void {
        if (selectedNode) {
            prevNode();
        } else if (selectedEdge) {
            prevEdge();
        }
    }

    // dragging
    const { dragMode, setDragMode } = useDragMode(
        props.editable,
        !props.disableEdgeAdd,
        layout.supportsDrag,
        onSetDragMode
    );

    // save image
    const saveImage = React.useCallback(async () => {
        const dataUrl = await extractImage();

        if (dataUrl) {
            // create a link and download the image
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'graph.png';
            link.click();
        }
    }, [extractImage]);

    let contentSelected = false;
    let panelTitle = '';

    if (selectedEdge) {
        contentSelected = state.graph.hasEdge(selectedEdge[0], selectedEdge[1]);
        panelTitle = 'Edge';
    } else if (selectedNode && state.editorMode !== EditorMode.EDGE_ENCODER) {
        contentSelected = state.graph.hasNode(selectedNode);
        panelTitle = 'Node';
    }

    // if the graph is not editable and there are no nodes, there's nothing to display so show a message
    if (!props.editable && Object.keys(props.graphData?.nodes).length === 0) {
        return (
            <Wrapper style={props.style}>
                <Center style={{ height: 300 }}>The CausalGraph structure is empty.</Center>
            </Wrapper>
        );
    }

    return (
        <SettingsProvider
            settings={{
                allowNodeDrag: layout.supportsDrag,
                allowSelectionWhenNotEditable: props.allowSelectionWhenNotEditable,
                disableEdgeAdd: props.disableEdgeAdd,
                disableLatentNodeAdd: props.disableLatentNodeAdd,
                disableNodeRemoval: props.disableNodeRemoval,
                editable: props.editable,
                editorMode: state.editorMode,
                onNotify: props.onNotify,
                verboseDescriptions: props.verboseDescriptions,
            }}
        >
            <PointerContext.Provider value={{ disablePointerEvents: isDragging, onPanelEnter, onPanelExit }}>
                <GraphPane $hasFocus={hasFocus} onClick={() => onPaneFocus(true)} ref={paneRef} style={props.style}>
                    <Graph onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
                        <Overlay
                            bottomLeft={
                                <Legend
                                    listItems={getLegendData(
                                        props.defaultLegends,
                                        state.editorMode,
                                        props.additionalLegends
                                    )}
                                />
                            }
                            onDelete={onDelete}
                            onNext={onNext}
                            onPrev={onPrev}
                            showFrameButtons={!isDragging && (showFrameButtons || hasFocus)}
                            title={panelTitle}
                            topCenter={
                                <>
                                    {showZoomPrompt && (
                                        <ZoomPrompt
                                            hasFocus={hasFocus}
                                            onClose={() => setShowZoomPrompt(false)}
                                            onDismiss={onDismiss}
                                        />
                                    )}
                                </>
                            }
                            topLeft={<RecalculateLayoutButton onResetLayout={resetLayout} />}
                            topRight={
                                <>
                                    <SearchBar
                                        onChange={(value) => {
                                            onSearchBarChange(value);
                                            // if the user searches, we want to expand all groups to perform the search
                                            if (layoutHasGroup) {
                                                expandGroups();
                                                setShowCollapseAll(true);
                                            }
                                        }}
                                        onClose={() => setSelectedNode(null)}
                                        onNext={onNextSearchResult}
                                        onPrev={onPrevSearchResult}
                                        selectedResult={currentSearchNode + 1}
                                        totalNumberOfResults={searchResults.length}
                                    />
                                    {layoutHasGroup && (
                                        <CollapseExpandButton
                                            onCollapseAll={() => {
                                                setShowCollapseAll(false);
                                                collapseGroups();
                                            }}
                                            onExpandAll={() => {
                                                expandGroups();
                                                setShowCollapseAll(true);
                                            }}
                                            showExpandAll={showCollapseAll}
                                        />
                                    )}
                                    <CenterGraphButton onResetZoom={resetViewport} />
                                    <AddNodeButton onAddNode={onAddNode} />
                                    <DragModeButton dragMode={dragMode} setDragMode={setDragMode} />
                                    <SaveImageButton onSave={saveImage} />
                                </>
                            }
                            validContentSelected={contentSelected}
                        >
                            <GraphContext.Provider
                                value={{
                                    api,
                                    constraints,
                                    editable: props.editable,
                                    graphState: state,
                                    onUpdateConstraint: updateConstraint,
                                    selectedEdge,
                                    selectedNode,
                                    verboseDescriptions: props.verboseDescriptions,
                                }}
                            >
                                {selectedEdge && (
                                    <EdgeInfoContent
                                        api={api}
                                        extraSections={props.edgeExtrasContent}
                                        key={selectedEdge.join('-')}
                                        onConfirmDirection={confirmDirection}
                                        onUpdateConstraint={updateConstraint}
                                        selectedConstraint={selectedConstraint}
                                        selectedEdge={selectedEdge}
                                        state={state}
                                    />
                                )}
                                {selectedNode && (
                                    <NodeInfoContent
                                        api={api}
                                        extraSections={props.nodeExtrasContent}
                                        key={selectedNode}
                                        selectedNode={selectedNode}
                                        state={state}
                                    />
                                )}
                            </GraphContext.Provider>
                        </Overlay>
                        {error && (
                            <NotificationWrapper>
                                <Notification notification={error} onDismiss={() => setError(null)} />
                            </NotificationWrapper>
                        )}
                        <div ref={canvasParentRef} style={{ height: '100%', width: '100%' }} />
                        <Tooltip
                            appendTo={canvasParentRef.current}
                            content={tooltipContent}
                            followCursor
                            getReferenceClientRect={tooltipRef.current}
                            visible={!isInPanel && !!tooltipContent}
                        />
                        <ConfirmationModal title="Confirm Removal" {...removeEdgeProps} />
                    </Graph>
                </GraphPane>
            </PointerContext.Provider>
        </SettingsProvider>
    );
}

export default CausalGraphEditor;
