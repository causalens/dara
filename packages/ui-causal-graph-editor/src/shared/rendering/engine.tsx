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
import { Cull } from '@pixi-essentials/cull';
import FontFaceObserver from 'fontfaceobserver';
import { LayoutMapping, XYPosition, assignLayout } from 'graphology-layout/utils';
import debounce from 'lodash/debounce';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';

import { DefaultTheme } from '@darajs/styled-components';
import { NotificationPayload } from '@darajs/ui-notifications';
import { Status } from '@darajs/ui-utils';

import { CustomLayout, FcoseLayout, GraphLayout } from '@shared/graph-layout';
import { DragMode } from '@shared/use-drag-mode';
import { getGroupToNodesMap, getNodeCategory, getNodeToGroupMap } from '@shared/utils';

import {
    EdgeConstraint,
    EdgeType,
    EditorMode,
    GroupNode,
    SimulationEdge,
    SimulationGraph,
    SimulationNode,
    ZoomThresholds,
} from '@types';

import { GraphLayoutWithTiers } from '../graph-layout/common';
import { Background } from './background';
import { EDGE_STRENGTHS, EdgeObject, EdgeStrengthDefinition, PixiEdgeStyle } from './edge';
import { GroupContainerObject } from './grouping/group-container-object';
import { NodeObject, PixiNodeStyle, getNodeSize } from './node';
import { FONT_FAMILY } from './text';
import { TextureCache } from './texture-cache';
import { colorToPixi, getZoomState, isGraphLayoutWithGroups, isGraphLayoutWithTiers } from './utils';

// Use 4k as a max reasonable resolution to render
const MAX_REASONABLE_HEIGHT = 2160;
const MAX_REASONABLE_WIDTH = 3840;
const MAX_REASONABLE_PIXELS = MAX_REASONABLE_HEIGHT * MAX_REASONABLE_WIDTH;

const WORLD_PADDING = 100;

const TEMP_EDGE_SYMBOL = Symbol('TEMP_EDGE');

const fontObserver = new FontFaceObserver(FONT_FAMILY);

export interface EngineEvents {
    backgroundClick: () => void;
    createEdge: (event: PIXI.FederatedMouseEvent, source: string, target: string) => void;
    dragEnd: () => void;
    dragStart: () => void;
    edgeClick: (event: PIXI.FederatedMouseEvent, source: string, target: string) => void;
    edgeMouseout: (event: PIXI.FederatedMouseEvent, edgeKey: string) => void;
    edgeMouseover: (event: PIXI.FederatedMouseEvent, edgeKey: string) => void;
    nodeClick: (event: PIXI.FederatedMouseEvent, nodeKey: string) => void;
    nodeMouseout: (event: PIXI.FederatedMouseEvent, nodeKey: string) => void;
    nodeMouseover: (event: PIXI.FederatedMouseEvent, nodeKey: string) => void;
    groupMouseout: (event: PIXI.FederatedMouseEvent, groupKey: string) => void;
    groupMouseover: (event: PIXI.FederatedMouseEvent, groupKey: string) => void;
}
export const ENGINE_EVENTS: Array<keyof EngineEvents> = [
    'createEdge',
    'backgroundClick',
    'edgeClick',
    'nodeClick',
    'dragStart',
    'dragEnd',
    'nodeMouseover',
    'nodeMouseout',
    'edgeMouseout',
    'edgeMouseover',
    'groupMouseout',
    'groupMouseover',
];

export class Engine extends PIXI.utils.EventEmitter<EngineEvents> {
    /** App instance */
    private app: PIXI.Application;

    /** Background object */
    private background: Background;

    /** Available edge constraints */
    private constraints: EdgeConstraint[];

    /** Parent container where canvas is rendered in */
    private container: HTMLElement;

    /** Debounced version of `this.updateLayout` in case multiple changes come in at the same time */
    public debouncedUpdateLayout = debounce(this.updateLayout, 150, { trailing: true });

    /** Current drag mode */
    private dragMode: DragMode = null;

    /** Container storing edge graphics */
    private edgeLayer: PIXI.Container;

    /** Edge ID -> EdgeObject cache */
    private edgeMap = new Map<string | symbol, EdgeObject>();

    /** Container storing edge symbol graphics */
    private edgeSymbolsLayer: PIXI.Container;

    /** Whether the graph is editable */
    private editable: boolean;

    /** Current editor mode */
    private editorMode: EditorMode;

    /** Graph state */
    private graph: SimulationGraph;

    /** Whether engine has been started */
    public initialized = false;

    /** Whether there is an edge being created */
    private isCreatingEdge = false;

    /** Whether a node is being moved */
    private isMovingNode = false;

    /** Graph layout instance */
    private layout?: GraphLayout;

    /** Which edge the user is holding down mouse button on */
    private mousedownEdgeKey: string | null = null;

    /** Which node the user is holding down mouse button on */
    private mousedownNodeKey: string | null = null;

    /** Container storing node label graphics */
    private nodeLabelLayer: PIXI.Container;

    /** Container storing node graphics */
    private nodeLayer: PIXI.Container;

    /** Node ID -> NodeObject cache */
    private nodeMap = new Map<string, NodeObject>();

    /** Center position of the node user pressed mousedown on, stored while user is holding down mouse1 */
    private nodeMousedownCenterPosition: PIXI.Point = null;

    /** Last mousedown event position stored while user is holding down mouse1 */
    private nodeMousedownPosition: PIXI.Point = null;

    /** Callback executed when a node is added */
    private onAddNode?: () => void = null;

    /** Callback executed when an edge is added */
    private onAddEdge?: () => void = null;

    /** Callback executed when engine is being destroyed */
    private onCleanup?: () => void = null;

    /** Container storing group container graphics */
    private groupContainerLayer: PIXI.Container;

    /** Group ID -> GroupContainerObject cache */
    private groupContainerMap = new Map<string, GroupContainerObject>();

    /** Group ID -> simulation edge array */
    private collapsedEdgesMap = new Map<string, SimulationEdge[]>();

    // Bound versions of handlers
    private onGraphAttributesUpdatedBound = this.onGraphAttributesUpdated.bind(this);

    private onGraphNodeAddedBound = this.onGraphNodeAdded.bind(this);

    private onGraphEdgeAddedBound = this.onGraphEdgeAdded.bind(this);

    private onGraphEdgeDroppedBound = this.onGraphEdgeDropped.bind(this);

    private onGraphNodeDroppedBound = this.onGraphNodeDropped.bind(this);

    private onGraphEdgeAttributesUpdatedBound = this.onGraphEdgeAttributesUpdated.bind(this);

    private onGraphNodeAttributesUpdatedBound = this.onGraphNodeAttributesUpdated.bind(this);

    private onDocumentMouseMoveBound = this.onDocumentMouseMove.bind(this);

    private onDocumentMouseUpBound = this.onDocumentMouseUp.bind(this);

    /** Callback executed when a drag motion is done */
    private onEndDrag?: () => void = null;

    /** Callback executed when a node is being moved */
    private onMove?: (nodeId: string, x: number, y: number) => void = null;

    /** Callback executed when a drag motion is started */
    private onStartDrag?: () => void = null;

    /** Callback for raising error from a layout build into the Graph component */
    private errorHandler?: (error: NotificationPayload) => void;

    /** Callback executed when an edge needs style change */
    private processEdgeStyle?: (edge: PixiEdgeStyle, attributes: SimulationEdge) => PixiEdgeStyle;

    /** Last render request ID - used to skip extra render calls */
    private renderRequestId: number = null;

    /** Whether the styles are dirty and need to be updated in the animation frame */
    private isStyleDirty = false;

    /** ResizeObserver instance watching window resizes */
    private resizeObserver: ResizeObserver;

    /** Current node search results */
    private searchResults: string[] = [];

    /** Currently selected edge. We keep track of it here so we can unselect it when need be */
    private selectedEdge: [string, string] | null = null;

    /** Currently selected node. We keep track of it here so we can unselect it when need be */
    private selectedNode: string | null = null;

    /** Current range of edge strength values provided in meta attributes */
    private strengthRange: [number, number] = null;

    /** Texture cache instance */
    private textureCache: TextureCache;

    /** Current theme */
    private theme: DefaultTheme;

    /** Graph UID */
    private uid: string;

    /** Viewport instance */
    private viewport: Viewport;

    /** Optional user-provided zoom thresholds */
    private zoomThresholds?: ZoomThresholds;

    /** whether zoom on scroll should be enabled only when the graph is focused */
    private requireFocusToZoom: boolean;

    /** Whether the graph is currently focused */
    private isFocused: boolean;

    constructor(
        graph: SimulationGraph,
        layout: GraphLayout,
        editable: boolean,
        editorMode: EditorMode,
        theme: DefaultTheme,
        constraints?: EdgeConstraint[],
        zoomThresholds?: ZoomThresholds,
        errorHandler?: (error: NotificationPayload) => void,
        processEdgeStyle?: (edge: PixiEdgeStyle, attributes: SimulationEdge) => PixiEdgeStyle,
        requireFocusToZoom?: boolean
    ) {
        super();
        this.graph = graph;
        this.requireFocusToZoom = requireFocusToZoom;
        this.editable = editable;
        this.editorMode = editorMode;
        this.layout = layout;
        this.theme = theme;
        this.constraints = constraints;
        this.zoomThresholds = zoomThresholds;
        this.errorHandler = errorHandler;
        this.processEdgeStyle = processEdgeStyle;
        this.isFocused = false;
        PIXI.Filter.defaultResolution = 3;
    }

    /**
     * Get the center position of the rendered viewport
     */
    public getCenterPosition(): PIXI.IPointData {
        return { x: this.viewport.center.x, y: this.viewport.center.y };
    }

    /**
     * Cleanup the app appropriately
     */
    public destroy(): void {
        // remove listeners
        this.graph.off('attributesUpdated', this.onGraphAttributesUpdatedBound);
        this.graph.off('nodeAdded', this.onGraphNodeAddedBound);
        this.graph.off('edgeAdded', this.onGraphEdgeAddedBound);
        this.graph.off('edgeDropped', this.onGraphEdgeDroppedBound);
        this.graph.off('nodeDropped', this.onGraphNodeDroppedBound);
        this.graph.off('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
        this.graph.off('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);

        this.onCleanup?.();
        this.textureCache.destroy();
        this.resizeObserver.disconnect();
        this.app.destroy(true, true);
    }

    /**
     * Mark styles to update them in the next animation frame
     */
    public markStylesDirty(): void {
        this.isStyleDirty = true;
    }

    /**
     * Request the graph to be re-rendered
     */
    public requestRender(): void {
        if (this.renderRequestId) {
            return;
        }

        this.renderRequestId = requestAnimationFrame(() => {
            if (this.isStyleDirty) {
                this.updateStyles();
                this.isStyleDirty = false;
            }
            if (this.viewport && this.app.stage) {
                this.graph.forEachEdge((e, attrs, source, target, sourceNodeAttributes, targetNodeAttributes) => {
                    const edgeObject = this.edgeMap.get(e);
                    if (edgeObject && attrs.points) {
                        const edgeStyle = this.getEdgeStyle(edgeObject, attrs);
                        const sourceNode = this.nodeMap.get(source);
                        const targetNode = this.nodeMap.get(target);
                        const sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
                        const targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };

                        edgeObject.updatePosition(
                            edgeStyle,
                            sourceNodePosition,
                            targetNodePosition,
                            sourceNode.nodeGfx.width,
                            targetNode.nodeGfx.width,
                            this.viewport,
                            this.textureCache
                        );
                    }
                });
            }

            if (this.app.renderer) {
                this.updateGraphVisibility();
            }
            if (this.app.stage) {
                this.app.render();
            }
            this.renderRequestId = null;
        });
    }

    /**
     * Reset the viewport to fit the graph centered on screen
     */
    public resetViewport(): void {
        // figure out the x/y bounds
        const nodesX = this.graph.mapNodes((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'x'));
        const nodesY = this.graph.mapNodes((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'y'));
        let minX = Math.min(...nodesX);
        let maxX = Math.max(...nodesX);
        let minY = Math.min(...nodesY);
        let maxY = Math.max(...nodesY);

        // if we have groups, we need to adjust the bounds so that the groups have a gap before the canvas border
        if (isGraphLayoutWithGroups(this.layout)) {
            const nodes = this.graph.mapNodes((nodeKey) => this.graph.getNodeAttributes(nodeKey));
            const nodesInGroups = Object.values(
                getGroupToNodesMap(this.graph.nodes(), this.layout.group, this.graph)
            ).flat();

            const updateBoundary = (node: SimulationNode, delta: number): number => {
                if (nodesInGroups.includes(node?.id)) {
                    return delta;
                }
                return 0;
            };

            const nodeWithMinX = nodes.find((node) => node.x === minX);
            const nodeWithMaxX = nodes.find((node) => node.x === maxX);
            const nodeWithMinY = nodes.find((node) => node.y === minY);
            const nodeWithMaxY = nodes.find((node) => node.y === maxY);

            minX += updateBoundary(nodeWithMinX, -20);
            maxX += updateBoundary(nodeWithMaxX, 20);
            minY += updateBoundary(nodeWithMinY, -20);
            maxY += updateBoundary(nodeWithMaxY, 20);
        }

        // compute graph size
        const graphWidth = Math.abs(maxX - minX);
        const graphHeight = Math.abs(maxY - minY);
        const graphCenter = new PIXI.Point(minX + graphWidth / 2, minY + graphHeight / 2);

        const worldWidth = graphWidth + WORLD_PADDING * 2;
        const worldHeight = graphHeight + WORLD_PADDING * 2;

        try {
            this.viewport.resize(this.container.clientWidth, this.container.clientHeight, worldWidth, worldHeight);

            this.viewport.setZoom(1);
            this.viewport.center = graphCenter;
            this.viewport.fit(true);

            this.updateGraphVisibility();
        } catch (err) {
            // Resizing can sometimes fail if e.g the canvas are temporarily not accessible due to an ongoing layout shift
            // We're simply ignoring this error as it's not critical and a future reset will likely succeed on next layout update
            // eslint-disable-next-line no-console
            console.error('Error resetting viewport', err);
        }
    }

    /**
     * Collapse all groups present in the graph
     */
    public collapseAllGroups(): void {
        if (isGraphLayoutWithGroups(this.layout)) {
            const layoutGroup = this.layout.group;
            const groupsObject = getGroupToNodesMap(this.graph.nodes(), layoutGroup, this.graph);
            const nodeToGroup = getNodeToGroupMap(this.graph.nodes(), layoutGroup, this.graph);
            const groupsArray = Object.keys(groupsObject);

            // first create all group nodes so that we have something to connect the edges to
            groupsArray.forEach((group) => {
                const groupNodeAttributes: GroupNode = {
                    id: group,
                    originalMeta: {},
                    variable_type: 'groupNode',
                };
                // remove all group containers
                this.dropGroupContainer(group);
                // if the group node doesn't exist create it
                if (!this.graph.hasNode(group)) {
                    this.graph.addNode(group, groupNodeAttributes);
                }
                // otherwise we just add them to the canvas
                else {
                    this.createNode(group, groupNodeAttributes);
                }
            });

            // collapse edges
            groupsArray.forEach((group) => {
                const collapsedEdges: SimulationEdge[] = [];

                this.graph.forEachEdge((edgeKey) => {
                    const initialSource = this.graph.source(edgeKey);
                    const initialTarget = this.graph.target(edgeKey);

                    // if the edge comes to or from the group we need to collapse it
                    if (
                        nodeToGroup[initialSource] === group ||
                        nodeToGroup[initialTarget] === group ||
                        groupsArray.includes(initialSource) ||
                        groupsArray.includes(initialTarget)
                    ) {
                        const finalTarget = nodeToGroup[initialTarget] ?? initialTarget;
                        const finalSource = nodeToGroup[initialSource] ?? initialSource;

                        // conditions
                        const edgeHasChanged = !(initialSource === finalSource && initialTarget === finalTarget);
                        const edgeIsNotWithinTheGroup = finalSource !== finalTarget;
                        const graphHasFinalEdge = this.graph.hasEdge(finalSource, finalTarget);

                        // attrbutes
                        const finalSourceAttributes = this.graph.getNodeAttributes(finalSource);
                        const finalTargetAttributes = this.graph.getNodeAttributes(finalTarget);
                        const currentEdgeAttributes = this.graph.getEdgeAttributes(edgeKey);
                        let numberOfCollapsedEdges =
                            graphHasFinalEdge ?
                                this.graph.getEdgeAttributes(finalSource, finalTarget)[
                                    'meta.rendering_properties.collapsedEdgesCount'
                                ]
                            :   0;

                        // upddate the number of collapsed edges count if needed
                        if (graphHasFinalEdge && edgeHasChanged && group === finalSource) {
                            numberOfCollapsedEdges += 1;
                        }

                        const edgeAttributes: SimulationEdge = {
                            ...currentEdgeAttributes,
                            'meta.rendering_properties.collapsedEdgesCount': numberOfCollapsedEdges,
                        };

                        // if source or target changed, i.e. they are part of a group, we should drop the edge
                        if (initialSource !== finalSource || initialTarget !== finalTarget) {
                            collapsedEdges.push({ id: edgeKey, ...edgeAttributes });
                            this.dropEdge(edgeKey);
                        }

                        // if the edge is within the same group we don't need to add them
                        if (edgeIsNotWithinTheGroup) {
                            // check if this edge already exists on the graph, as more than one might resolve to the same when collapsing groups
                            if (!graphHasFinalEdge && group === finalSource) {
                                edgeAttributes['meta.rendering_properties.collapsedEdgesCount'] = 1;

                                this.graph.addEdge(finalSource, finalTarget, edgeAttributes);

                                // on further collapses the condition to display the edge is whether it is in the edgeMap
                                // whe should also only add edges that go to or from a group node
                            } else if (!this.edgeMap.has(edgeKey) && !edgeHasChanged) {
                                this.createEdge(
                                    edgeKey,
                                    edgeAttributes,
                                    finalSource,
                                    finalTarget,
                                    finalSourceAttributes,
                                    finalTargetAttributes
                                );
                                // if the edge already exists we just need to update the count of collapsed edges
                            } else if (graphHasFinalEdge) {
                                this.graph.setEdgeAttribute(
                                    finalSource,
                                    finalTarget,
                                    'meta.rendering_properties.collapsedEdgesCount',
                                    numberOfCollapsedEdges
                                );
                            }
                        }
                    }
                });

                // set all collapsed edges so that we can rebuild them later
                this.collapsedEdgesMap.set(group, collapsedEdges);
            });

            // hide all the nodes within groups
            Object.values(groupsObject).forEach((nodes) => {
                nodes.forEach((node) => {
                    if (this.nodeMap.has(node)) {
                        this.dropNode(node);
                    }
                });
            });

            this.requestRender();
        }
    }

    /**
     * Expand all groups present in the graph
     */
    public expandAllGroups(): void {
        // We only need to expand groups if the graph has at least one of the group nodes
        if (this.graph.nodes().some((node) => this.graph.getNodeAttribute(node, 'variable_type') === 'groupNode')) {
            // cleanup the edges that were created between groups
            this.graph.forEachEdge((edgeKey) => {
                const source = this.graph.source(edgeKey);
                const target = this.graph.target(edgeKey);

                const isSourceGroupNode = this.graph.getNodeAttribute(source, 'variable_type') === 'groupNode';
                const isTargetGroupNode = this.graph.getNodeAttribute(target, 'variable_type') === 'groupNode';
                if (isSourceGroupNode || isTargetGroupNode) {
                    this.dropEdge(edgeKey);
                    // reset the count of collapsed edges
                    this.graph.setEdgeAttribute(source, target, 'meta.rendering_properties.collapsedEdgesCount', 0);
                }
            });

            // first we add all the nodes that were hidden
            this.graph.forEachNode((node, attributes) => {
                if (this.graph.getNodeAttribute(node, 'variable_type') !== 'groupNode') {
                    // only create the node if it doesn't exist
                    if (!this.nodeMap.has(node)) {
                        this.createNode(node, attributes);
                    }
                } else {
                    this.dropNode(node);
                }
            });

            // then we need to recreate all the edges that were collapsed
            this.collapsedEdgesMap.forEach((edges) => {
                edges.forEach((edge) => {
                    if (!this.edgeMap.has(edge.id)) {
                        const source = edge.extras?.source.identifier;
                        const target = edge.extras?.destination.identifier;
                        const sourceNodeAttributes = this.graph.getNodeAttributes(source);
                        const targetNodeAttributes = this.graph.getNodeAttributes(target);
                        this.createEdge(edge.id, edge, source, target, sourceNodeAttributes, targetNodeAttributes);
                    }
                });
            });

            // redraw all group containers
            this.createGroupContainers();

            this.markStylesDirty();
            this.requestRender();
        }
    }

    /**
     * Update matched status based on new search result
     *
     * @param ids ids found in search result
     */
    public searchNodes(ids: string[]): void {
        const newNodes = ids.filter((newId) => !this.searchResults.includes(newId));
        const removedNodes = this.searchResults.filter((oldId) => !ids.includes(oldId));

        for (const nodeId of newNodes) {
            const node = this.nodeMap.get(nodeId);

            if (node) {
                node.state.matched = true;
                this.updateNodeStyleByKey(nodeId);
            }
        }

        for (const nodeId of removedNodes) {
            const node = this.nodeMap.get(nodeId);

            if (node) {
                node.state.matched = false;
                this.updateNodeStyleByKey(nodeId);
            }
        }

        this.searchResults = ids;
        this.requestRender();
    }

    /**
     * Select an edge with given id
     *
     * @param id id of the edge
     */
    public selectEdge(path: [string, string]): void {
        // If there was a previously selected edge, unselect it
        if (this.selectedEdge) {
            const id = this.graph.edge(this.selectedEdge[0], this.selectedEdge[1]);
            const edge = this.edgeMap.get(id);

            // Check if it exists - could've been removed
            if (edge) {
                edge.state.selected = false;
            }

            // also unselect the extremities
            const [source, target] = this.selectedEdge;
            const sourceNode = this.nodeMap.get(source);
            const targetNode = this.nodeMap.get(target);
            if (sourceNode) {
                sourceNode.state.attachedEdgeSelected = false;
            }
            if (targetNode) {
                targetNode.state.attachedEdgeSelected = false;
            }
        }

        // Select new edge if specified
        if (path) {
            const [source, target] = path;
            const id = this.graph.edge(source, target);
            const edge = this.edgeMap.get(id);
            if (edge) {
                edge.state.selected = true;
                this.selectedEdge = [source, target];

                // also select the extremities
                const sourceNode = this.nodeMap.get(source);
                const targetNode = this.nodeMap.get(target);
                if (sourceNode) {
                    sourceNode.state.attachedEdgeSelected = true;
                }
                if (targetNode) {
                    targetNode.state.attachedEdgeSelected = true;
                }
            }
        } else {
            this.selectedEdge = null;
        }

        // Update all visuals as we might need to dim things
        this.markStylesDirty();
        this.requestRender();
    }

    /**
     * Select a node with given id
     *
     * @param id id of the node
     */
    public selectNode(id: string): void {
        // Nodes cannot be selected in edge encoder mode
        if (this.editorMode === EditorMode.EDGE_ENCODER) {
            return;
        }

        // If there was a previously selected node, unselect it
        if (this.selectedNode) {
            const node = this.nodeMap.get(this.selectedNode);

            // Check if node exists - could've been removed
            if (node) {
                node.state.selected = false;
            }
        }

        // Select new node if specified
        if (id) {
            const node = this.nodeMap.get(id);
            node.state.selected = true;
        }

        this.selectedNode = id;

        // Update all visuals as we might need to dim things
        this.markStylesDirty();
        this.requestRender();
    }

    /**
     * Update drag mode
     *
     * @param dragMode drag mode to set
     */
    public setDragMode(dragMode: DragMode): void {
        this.dragMode = dragMode;
    }

    /**
     * Update theme used
     *
     * @param theme theme used
     */
    public setTheme(theme: DefaultTheme): void {
        this.theme = theme;
        this.background.updateTexture(theme, this.textureCache);
        [(this.app.renderer as PIXI.Renderer).background.color] = colorToPixi(this.theme.colors.blue1);

        this.markStylesDirty();
        this.requestRender();
    }

    /**
     * Start the rendering engine
     *
     * @param container container to start in - canvas will be injected into it
     */
    public async start(container: HTMLElement): Promise<void> {
        // Wait for font to be available
        await fontObserver.load();

        this.container = container;
        const [initialColor] = colorToPixi(this.theme.colors.blue1);

        this.app = new PIXI.Application({
            antialias: true,
            autoDensity: true,
            autoStart: false,
            backgroundAlpha: 1,
            backgroundColor: initialColor,
            powerPreference: 'high-performance',
            resizeTo: container,
            resolution: window.devicePixelRatio,
        });

        // Add a canvas to the container
        container.appendChild(this.app.view as HTMLCanvasElement);
        this.textureCache = new TextureCache(this.app.renderer);

        // Create viewport and add it to the app
        this.viewport = new Viewport({
            events: this.app.renderer.events,
        });

        // enable viewport features
        this.viewport.drag({ wheel: false }).pinch().decelerate().clampZoom({ maxScale: 2 });

        // always enable wheel zoom if focus is not required
        if (!this.requireFocusToZoom) {
            this.toggleWheelZoom(true);
        }

        this.viewport.addEventListener('frame-end', () => {
            if (this.viewport.dirty) {
                this.requestRender();
                this.viewport.dirty = false;
            }
        });

        // Set bg
        this.background = new Background(this.theme, this.textureCache, this.viewport);
        this.background.on('click', () => this.emit('backgroundClick'));
        this.background.updatePosition(this.container);

        // Add background before viewport so viewport takes events first
        this.app.stage.addChild(this.background.sprite);
        this.app.stage.addChild(this.viewport);

        // create layers - containers to hold different rendered parts of the graph
        this.groupContainerLayer = new PIXI.Container();

        this.edgeLayer = new PIXI.Container();
        this.edgeSymbolsLayer = new PIXI.Container();

        this.nodeLayer = new PIXI.Container();
        this.nodeLabelLayer = new PIXI.Container();

        this.viewport.addChild(this.groupContainerLayer);

        this.viewport.addChild(this.edgeLayer);
        this.viewport.addChild(this.edgeSymbolsLayer);

        this.viewport.addChild(this.nodeLayer);
        this.viewport.addChild(this.nodeLabelLayer);

        // Observe window resizing
        this.resizeObserver = new ResizeObserver((entries) => {
            const oldBounds = this.graph.getAttribute('extras')?.bounds;
            const boundsChanged = entries.some((entry) => {
                const newBounds = entry.contentRect;
                const newWidth = Math.round(newBounds.width);
                const newHeight = Math.round(newBounds.height);
                return oldBounds?.width !== newWidth || oldBounds?.height !== newHeight;
            });

            if (!boundsChanged) {
                return;
            }

            this.app.resize();
            this.viewport.resize(this.container.clientWidth, this.container.clientHeight);
            this.background.updatePosition(this.container);

            // keep layout in sync - invoke a debounced update to only update it once resizing is done rather than
            // re-running a potentially expensive layout computation on every resize event
            // this should happen only when the graph is not currently focused
            if (!this.isFocused) {
                this.debouncedUpdateLayout();
            }
        });

        this.resizeObserver.observe(this.container);

        // setup listeners so engine can react to changes made to the graph instance
        this.graph.on('attributesUpdated', this.onGraphAttributesUpdatedBound);
        this.graph.on('nodeAdded', this.onGraphNodeAddedBound);
        this.graph.on('edgeAdded', this.onGraphEdgeAddedBound);
        this.graph.on('edgeDropped', this.onGraphEdgeDroppedBound);
        this.graph.on('nodeDropped', this.onGraphNodeDroppedBound);
        this.graph.on('edgeAttributesUpdated', this.onGraphEdgeAttributesUpdatedBound);
        this.graph.on('nodeAttributesUpdated', this.onGraphNodeAttributesUpdatedBound);

        const nodesX = this.graph.mapNodes((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'x'));
        const nodesY = this.graph.mapNodes((nodeKey) => this.graph.getNodeAttribute(nodeKey, 'y'));
        const initialPositionsDefined =
            nodesX.every((nx) => nx !== undefined) && nodesY.every((ny) => ny !== undefined);

        // Set base size for layout computations
        this.graph.updateAttribute('size', () => (this.layout.nodeSize ? this.layout.nodeSize * 1.5 : 50));

        // Skip initial layout computation if all nodes have x/y defined
        if (!initialPositionsDefined) {
            // if user provided a custom layout without positions, fall back to Fcose as a good default
            // TODO: in the future only do this if the custom layout does not have a callback provided
            if (this.layout instanceof CustomLayout) {
                this.layout = FcoseLayout.Builder.nodeSize(this.layout.nodeSize)
                    .nodeFontSize(this.layout.nodeFontSize)
                    .build();
            }
            this.updateLayout();
        }

        this.createGraph();
        this.resetViewport();
        // need to update styles once again after changing the viewport
        this.markStylesDirty();
        this.initialized = true;
        this.resetViewport();
    }

    /**
     * Notify the engine about focus change on the graph canvas
     *
     * This is used to enable/disable behaviour depending on focus state, e.g. zoom on wheel
     *
     * @param isFocused - focus state
     */
    public setFocus(isFocused: boolean): void {
        this.isFocused = isFocused;
        if (!this.requireFocusToZoom) {
            return;
        }
        this.toggleWheelZoom(isFocused);
    }

    /**
     * Toggle zoom-on-wheel behaviour
     *
     * @param isEnabled - whether to enable or disable wheel zoom
     */
    public toggleWheelZoom(isEnabled: boolean): void {
        if (isEnabled) {
            this.viewport.wheel();
            this.app.view.addEventListener('wheel', Engine.wheelListener);
        } else {
            this.viewport.plugins.remove('wheel');
            this.app.view.removeEventListener('wheel', Engine.wheelListener);
        }
    }

    /**
     * Wheel listener which disables the default browser scrolling behaviour
     *
     * @param event - mouse wheel event
     */
    private static wheelListener(event: WheelEvent): void {
        event.preventDefault();
    }

    /**
     * Extract current visible canvas state to an image
     */
    public async extractImage(): Promise<string> {
        // create a new container to render
        const containerWithBackground = new PIXI.Container();

        // Add a custom background since renderer background is not rendered, simply render a single-color rect
        const bg = new PIXI.Graphics();
        bg.beginFill(this.app.renderer.background.color, 1);
        bg.drawRect(0, 0, this.app.renderer.width, this.app.renderer.height);
        bg.endFill();
        containerWithBackground.addChild(bg);

        // add the stage
        containerWithBackground.addChild(this.app.stage);

        // compute x/y bounds of the graph, this is to not waste resolution on empty space
        const nodesCoords = this.nodeLayer.children.map((nodeObj) => nodeObj.getGlobalPosition());
        const nodesX = nodesCoords.map((nodeCoord) => nodeCoord.x);
        const nodesY = nodesCoords.map((nodeCoord) => nodeCoord.y);
        const minX = Math.min(...nodesX);
        const maxX = Math.max(...nodesX);
        const minY = Math.min(...nodesY);
        const maxY = Math.max(...nodesY);

        const region = new PIXI.Rectangle(
            minX - WORLD_PADDING,
            minY - WORLD_PADDING,
            maxX - minX + WORLD_PADDING * 2,
            maxY - minY + WORLD_PADDING * 2
        );

        let resolution = window.devicePixelRatio;

        // make sure WEBGL renderer is available
        if (this.app.renderer.type === PIXI.RENDERER_TYPE.WEBGL) {
            // compute what's the max safe WEBGL dimension size we can render without crashing
            const { gl } = this.app.renderer as PIXI.Renderer;
            const maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
            const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            const maxSafeDimension = Math.min(maxRenderBufferSize, maxTextureSize);

            // now calculate our ideal resolution to get to 4k resolution in the generated image
            const area = region.width * region.height;
            const desiredResolution = Math.sqrt(MAX_REASONABLE_PIXELS / area);

            // scale the dimensions, capping each on the max safe dimension
            const scaledWidth = Math.min(region.width * desiredResolution, maxSafeDimension);
            const scaledHeight = Math.min(region.height * desiredResolution, maxSafeDimension);

            // pick the smaller scale factor
            resolution = Math.floor(Math.min(scaledWidth / region.width, scaledHeight / region.height));
        }

        const renderTexture = this.app.renderer.generateTexture(containerWithBackground, {
            scaleMode: PIXI.SCALE_MODES.LINEAR,
            // increase the resolution for better quality
            resolution,
            multisample: PIXI.MSAA_QUALITY.HIGH,
            region,
        });

        // generate the data URL
        return this.app.renderer.extract.base64(renderTexture, 'image/png');
    }

    /**
     * Update the set of constraints
     *
     * @param constraints new constraints
     */
    public updateConstraints(constraints: EdgeConstraint[]): void {
        this.constraints = constraints;
        this.graph.forEachEdge((k) => this.updateEdgeStyleByKey(k));
        this.requestRender();
    }

    /**
     * Create an edge
     *
     * @param id edge id
     * @param attributes  edge attributes
     * @param source source node id
     * @param target target node i
     * @param sourceAttributes source node attributes
     * @param targetAttributes target node attributes
     */
    private createEdge(
        id: string,
        attributes: SimulationEdge,
        source: string,
        target: string,
        sourceAttributes: SimulationNode,
        targetAttributes: SimulationNode
    ): void {
        const edge = new EdgeObject();
        this.edgeLayer.addChild(edge.edgeGfx);
        this.edgeSymbolsLayer.addChild(edge.edgeSymbolsGfx);
        this.edgeMap.set(id, edge);

        edge.addListener('mouseover', (event: PIXI.FederatedMouseEvent) => {
            if (!this.mousedownNodeKey) {
                this.hoverEdge(id);
                this.emit('edgeMouseover', event, id);
            }
        });
        edge.addListener('mouseout', (event: PIXI.FederatedMouseEvent) => {
            this.unhoverEdge(id);
            this.emit('edgeMouseout', event, id);
        });

        edge.addListener('mousedown', () => {
            this.mousedownNodeKey = null;
            this.mousedownEdgeKey = id;
        });
        edge.addListener('mouseup', (event: PIXI.FederatedMouseEvent) => {
            if (this.mousedownEdgeKey === id) {
                if (isGraphLayoutWithGroups(this.layout)) {
                    const groupsObject = getGroupToNodesMap(this.graph.nodes(), this.layout.group, this.graph);
                    if (Object.keys(groupsObject).includes(source) || Object.keys(groupsObject).includes(target)) {
                        return;
                    }
                }
                this.emit('edgeClick', event, source, target);
            }
        });

        // Update edge and the source as we were dragging from it
        this.updateEdgeStyle(id, attributes, source, target, sourceAttributes, targetAttributes);
    }

    /**
     * Create the graph.
     *
     * Creates edges and nodes based on current graph state.
     */
    private createGraph(): void {
        // Create nodes, edges and group containers if needed
        this.createGroupContainers();
        this.graph.forEachNode(this.createNode.bind(this));
        this.graph.forEachEdge(this.createEdge.bind(this));

        this.updateStrengthRange();
    }

    /**
     * Create a node
     *
     * @param id node id
     * @param attributes node attributes
     */
    private createNode(id: string, attributes: SimulationNode): void {
        const node = new NodeObject();
        this.nodeLayer.addChild(node.nodeGfx);
        this.nodeLabelLayer.addChild(node.nodeLabelGfx);
        this.nodeMap.set(id, node);

        node.addListener('mouseover', (event: PIXI.FederatedMouseEvent) => {
            // Always show hover state
            this.hoverNode(id);

            // Only trigger the event (i.e. tooltip) if not currently dragging
            if (!this.mousedownNodeKey) {
                this.emit('nodeMouseover', event, id);
            }
        });
        node.addListener('mouseout', (event: PIXI.FederatedMouseEvent) => {
            const local = node.nodeGfx.toLocal(event.global);
            const isInNode = node.nodeGfx.hitArea.contains(local.x, local.y);

            // only trigger mouseout if it's actually outside the node (could be within label)
            if (!isInNode) {
                this.unhoverNode(id);
                this.emit('nodeMouseout', event, id);
            }

            // don't reset mousedownKey if we're dragging as this can prevent the drag
            // from working correctly when dragging quickly outside of a node
            if (!this.editable && !this.isMovingNode && !this.isCreatingEdge) {
                // resets mousedown position
                this.mousedownNodeKey = null;
            }
        });

        node.addListener('mousedown', (event: PIXI.FederatedMouseEvent) => {
            this.mousedownEdgeKey = null;
            this.mousedownNodeKey = id;

            if (this.dragMode) {
                this.enableDragBehaviour();
            }

            this.nodeMousedownCenterPosition = node.nodeGfx.getGlobalPosition().clone();
            this.nodeMousedownPosition = event.global.clone();
        });

        node.addListener('mouseup', (event: PIXI.FederatedMouseEvent) => {
            // If mouseup happened on the same node mousedown happened
            if (this.mousedownNodeKey === id && this.nodeMousedownPosition) {
                const xOffset = Math.abs(this.nodeMousedownPosition.x - event.global.x);
                const yOffset = Math.abs(this.nodeMousedownPosition.y - event.global.y);

                // only trigger click if the mousedown&mouseup happened very close to each other
                if (xOffset <= 2 && yOffset <= 2) {
                    if (isGraphLayoutWithGroups(this.layout)) {
                        const groupsObject = getGroupToNodesMap(this.graph.nodes(), this.layout.group, this.graph);
                        if (Object.keys(groupsObject).includes(id)) {
                            return;
                        }
                    }
                    this.emit('nodeClick', event, id);
                }
            }

            // If mouseup happened on a different node
            if (this.isCreatingEdge && this.mousedownNodeKey && this.mousedownNodeKey !== id) {
                // check if the edge doesn't already exist
                if (!this.graph.hasEdge(this.mousedownNodeKey, id)) {
                    // emit event to create a real edge
                    this.emit('createEdge', event, this.mousedownNodeKey, id);
                }
            }
            if (!this.editable) {
                // resets mousedown position
                this.mousedownNodeKey = null;
            }
        });

        this.updateNodeStyle(id, attributes);
    }

    /**
     * Create a group container
     *
     * @param id node id
     * @param nodes a list of simulation nodes that are part of the group
     */
    private createGroupContainer(id: string, nodes: SimulationNode[]): void {
        const groupContainer = new GroupContainerObject();
        this.groupContainerLayer.addChild(groupContainer.groupContainerGfx);
        this.groupContainerMap.set(id, groupContainer);

        groupContainer.addListener('mouseover', (event: PIXI.FederatedMouseEvent) => {
            // Only trigger the event (i.e. tooltip) if not currently dragging
            if (!this.mousedownNodeKey) {
                this.emit('groupMouseover', event, id);
            }
        });
        groupContainer.addListener('mouseout', (event: PIXI.FederatedMouseEvent) => {
            const local = groupContainer.groupContainerGfx.toLocal(event.global);
            const isInGroupContainer = groupContainer.groupContainerGfx.hitArea.contains(local.x, local.y);

            // only trigger mouseout if it's actually outside the group (could be within label)
            if (!isInGroupContainer) {
                this.emit('groupMouseout', event, id);
            }

            // don't reset mousedownKey if we're dragging as this can prevent the drag
            // from working correctly when dragging quickly outside of a container
            if (!this.editable && !this.isMovingNode && !this.isCreatingEdge) {
                // resets mousedown position
                this.mousedownNodeKey = null;
            }
        });

        this.updateGroupContainerStyle(id, nodes);
    }

    /**
     * Creates all group containers
     */
    private createGroupContainers(): void {
        if (isGraphLayoutWithGroups(this.layout)) {
            const { group } = this.layout;
            const groups = getGroupToNodesMap(this.graph.nodes(), group, this.graph);
            Object.keys(groups).forEach((gr) => {
                const nodesIngroup = groups[gr].map((node) => this.graph.getNodeAttributes(node));
                this.createGroupContainer(gr, nodesIngroup);
            });
        }
    }

    /**
     * Drop the edge graphics from the renderer
     *
     * @param id edge id
     */
    private dropEdge(id: string): void {
        const edge = this.edgeMap.get(id);

        if (edge) {
            this.edgeLayer.removeChild(edge.edgeGfx);
            this.edgeSymbolsLayer.removeChild(edge.edgeSymbolsGfx);
            this.edgeMap.delete(id);
        }
    }

    /**
     * Drop the node graphics from the renderer
     *
     * @param id node id
     */
    private dropNode(id: string): void {
        const node = this.nodeMap.get(id);

        if (node) {
            this.nodeLayer.removeChild(node.nodeGfx);
            this.nodeLabelLayer.removeChild(node.nodeLabelGfx);
            this.nodeMap.delete(id);
            this.requestRender();
        }
    }

    /**
     * Drop the group container graphics from the renderer
     *
     * @param id node id
     */
    private dropGroupContainer(id: string): void {
        const container = this.groupContainerMap.get(id);

        if (container) {
            this.groupContainerLayer.removeChild(container.groupContainerGfx);
            this.groupContainerMap.delete(id);
            this.requestRender();
        }
    }

    /**
     * Enables drag behaviour
     *
     * Pauses viewport dragging and installs listeners for mouse movement
     */
    private enableDragBehaviour(): void {
        if (this.dragMode === 'move_node') {
            this.isMovingNode = true;
            this.isCreatingEdge = false;

            this.onStartDrag?.();
        }
        if (this.dragMode === 'create_edge') {
            this.isCreatingEdge = true;
            this.isMovingNode = false;

            // Create a temporary edge
            const tempEdge = new EdgeObject(true);
            this.edgeLayer.addChild(tempEdge.edgeGfx);
            this.edgeMap.set(TEMP_EDGE_SYMBOL, tempEdge);
        }

        this.viewport.pause = true; // disable viewport dragging

        document.addEventListener('mousemove', this.onDocumentMouseMoveBound);
        document.addEventListener('mouseup', this.onDocumentMouseUpBound, { once: true });
    }

    /**
     * Get constraint for given edge
     *
     * @param source edge source
     * @param target edge target
     */
    private getConstraint(source: string, target: string): EdgeConstraint {
        return this.constraints?.find(
            (c) => (c.source === source && c.target === target) || (c.source === target && c.target === source)
        );
    }

    /**
     * Get style object to determine edge behaviour
     *
     * @param edge edge object to get styles for
     * @param attributes edge attributes
     * @param constraint optional attached constraint, used in edge encoder mode
     */
    private getEdgeStyle(edge: EdgeObject, attributes: SimulationEdge, constraint?: EdgeConstraint): PixiEdgeStyle {
        const edgeStyle = {
            accepted: attributes['meta.rendering_properties.accepted'],
            color: attributes['meta.rendering_properties.color'],
            constraint,
            editorMode: this.editorMode,
            forced: attributes['meta.rendering_properties.forced'],
            isEdgeSelected: !!this.selectedEdge,
            points: attributes.points,
            state: edge.state,
            strength: this.getRelativeStrength(attributes),
            theme: this.theme,
            thickness: attributes['meta.rendering_properties.thickness'],
            type: attributes.edge_type,
            collapsedEdges: attributes['meta.rendering_properties.collapsedEdgesCount'],
        };
        if (this.processEdgeStyle) {
            return this.processEdgeStyle(edgeStyle, attributes);
        }
        return edgeStyle;
    }

    /**
     * Get style object to determine node behaviour
     *
     * @param node node object to get styles for
     * @param attributes node attributes
     */
    private getNodeStyle(node: NodeObject, attributes: SimulationNode): PixiNodeStyle {
        const group = getNodeCategory(this.graph, attributes.id, attributes['meta.rendering_properties.latent']);

        return {
            color: attributes['meta.rendering_properties.color'],
            category: group,
            highlight_color: attributes['meta.rendering_properties.highlight_color'],
            isEdgeSelected: !!this.selectedEdge,
            isSourceOfNewEdge: this.isCreatingEdge && this.mousedownNodeKey === attributes.id,
            label: attributes['meta.rendering_properties.label'] ?? attributes.id,
            label_color: attributes['meta.rendering_properties.label_color'],
            label_size: attributes['meta.rendering_properties.label_size'] ?? this.layout.nodeFontSize,
            size:
                attributes['meta.rendering_properties.size'] ??
                getNodeSize(attributes['meta.rendering_properties.size'] ?? this.layout.nodeSize, group),
            state: node.state,
            theme: this.theme,
            isGroupNode: attributes.variable_type === 'groupNode',
        };
    }

    /**
     * Enable hover state for given edge
     *
     * @param id id of edge to hover
     */
    private hoverEdge(id: string): void {
        const edge = this.edgeMap.get(id);
        if (edge.state.hover) {
            return;
        }

        // update style
        edge.state.hover = true;
        this.updateEdgeStyleByKey(id);
        this.requestRender();
    }

    /**
     * Enable hover state for given node
     *
     * @param id id of node to hover
     */
    private hoverNode(id: string): void {
        const node = this.nodeMap.get(id);
        if (node.state.hover) {
            return;
        }

        // update style
        node.state.hover = true;
        this.updateNodeStyleByKey(id);
        this.requestRender();
    }

    /**
     * Move given node to target position
     *
     * @param nodeKey id of node to move
     * @param point target position
     */
    private moveNode(nodeKey: string, point: PIXI.IPointData): void {
        // Update positions - this will trigger re-renders
        this.graph.setNodeAttribute(nodeKey, 'x', point.x);
        this.graph.setNodeAttribute(nodeKey, 'y', point.y);

        this.onMove?.(nodeKey, point.x, point.y);
    }

    /**
     * Move handler - drag behaviour
     *
     * @param event mouse event
     */
    private onDocumentMouseMove(event: MouseEvent): void {
        this.emit('dragStart');

        const eventPosition = new PIXI.Point(event.offsetX, event.offsetY);
        const eventWorldPosition = this.viewport.toWorld(eventPosition);

        // Continue move behaviour based on mode started when we started the drag
        // as controlled by isMovingNode/isCreatingEdge
        // We're not using dragMode here in case it changed mid-drag
        if (this.mousedownNodeKey) {
            if (this.isMovingNode) {
                this.moveNode(this.mousedownNodeKey, eventWorldPosition);
            }
            if (this.isCreatingEdge) {
                const nodeWorldPosition = this.viewport.toWorld(this.nodeMousedownCenterPosition);

                // move the temp edge
                const tempEdge = this.edgeMap.get(TEMP_EDGE_SYMBOL);
                tempEdge.updatePosition(
                    {
                        // use undirected edge / PAG viewer to draw an edge without symbols
                        editorMode: EditorMode.PAG_VIEWER,
                        isEdgeSelected: false,
                        state: tempEdge.state,
                        theme: this.theme,
                        type: EdgeType.UNDIRECTED_EDGE,
                    },
                    nodeWorldPosition,
                    eventWorldPosition,
                    0,
                    0,
                    this.viewport,
                    this.textureCache
                );
                this.requestRender();
            }
        }
    }

    /**
     * On mouse up, stop drag - reset stored mousedown keys and remove moving listener
     */
    private onDocumentMouseUp(): void {
        const initialMousedownNodeKey = this.mousedownNodeKey;
        this.mousedownNodeKey = null;

        if (this.isMovingNode) {
            this.onEndDrag?.();
        }
        if (this.isCreatingEdge) {
            // remove the temp edge
            const tempEdge = this.edgeMap.get(TEMP_EDGE_SYMBOL);
            this.edgeLayer.removeChild(tempEdge.edgeGfx);

            if (initialMousedownNodeKey) {
                this.updateNodeStyleByKey(initialMousedownNodeKey);
            }
        }

        this.viewport.pause = false; // enable viewport dragging
        document.removeEventListener('mousemove', this.onDocumentMouseMoveBound);

        this.emit('dragEnd');
    }

    // Graph change handlers

    private onGraphAttributesUpdated({ attributes }: { attributes: { size?: number; uid?: string } }): void {
        // UID is re-generated on each parser run; beyond first run make sure to keep visuals up-to-date
        if (this.uid) {
            this.markStylesDirty();
            this.requestRender();
        }
        this.uid = attributes.uid;
    }

    private onGraphNodeAdded({ key, attributes }: { attributes: SimulationNode; key: string }): void {
        this.createNode(key, attributes);

        // If the node is added without a position set, we need to recompute layout or otherwise
        // it won't be drawn on screen
        if (!attributes.x && !attributes.y) {
            this.debouncedUpdateLayout();
        }

        this.markStylesDirty();
        this.requestRender();
        this.onAddNode?.();
    }

    private onGraphEdgeAdded({
        key,
        source,
        target,
        attributes,
    }: {
        attributes: SimulationEdge;
        key: string;
        source: string;
        target: string;
        undirected: boolean;
    }): void {
        const sourceNodeAttrs = this.graph.getNodeAttributes(source);
        const targetNodeAttrs = this.graph.getNodeAttributes(target);
        this.createEdge(key, attributes, source, target, sourceNodeAttrs, targetNodeAttrs);
        this.updateStrengthRange();
        this.markStylesDirty();
        this.requestRender();
        this.onAddEdge?.();
    }

    private onGraphEdgeDropped({ key }: { key: string }): void {
        this.dropEdge(key);
        this.updateStrengthRange();
    }

    private onGraphNodeDropped({ key }: { key: string }): void {
        this.dropNode(key);
    }

    private onGraphEdgeAttributesUpdated(): void {
        this.updateStrengthRange();
        this.markStylesDirty();
        this.requestRender();
    }

    private onGraphNodeAttributesUpdated(): void {
        this.markStylesDirty();
        this.requestRender();
    }

    /**
     * Apply a given layout to the graph
     *
     * @param layout layout to apply
     */
    private setLayout(
        layout: LayoutMapping<XYPosition>,
        edgePoints?: LayoutMapping<XYPosition[]>,
        resetViewport = true
    ): void {
        assignLayout(this.graph, layout);

        // Apply edge points if provided
        if (edgePoints) {
            Object.entries(edgePoints).forEach(([key, points]) => {
                const [source, target] = key.split('||');
                this.graph.setEdgeAttribute(source, target, 'points', points);
            });
        }

        if (resetViewport) {
            this.resetViewport();
        }

        this.markStylesDirty();

        // re-render with new layout
        this.requestRender();
    }

    /**
     * Get relative strength definition based on all edge thickness provided
     *
     * @param attributes edge attributes
     */
    private getRelativeStrength(attributes: SimulationEdge): EdgeStrengthDefinition {
        //  only work in DAG mode with thickness defined
        if (this.editorMode !== EditorMode.DEFAULT || !attributes['meta.rendering_properties.thickness']) {
            return null;
        }

        // If there isn't a range to scale with
        if (!this.strengthRange) {
            return null;
        }

        const [sourceMin, sourceMax] = this.strengthRange;

        // Range to interpolate to
        const targetMax = EDGE_STRENGTHS.length - 1;

        const value = attributes['meta.rendering_properties.thickness'];

        const index = Math.round(((value - sourceMin) * targetMax) / (sourceMax - sourceMin));

        return EDGE_STRENGTHS[index];
    }

    /**
     * Disable hover state for given edge
     *
     * @param id id of edge to unhover
     */
    private unhoverEdge(id: string): void {
        const edge = this.edgeMap.get(id);
        if (!edge.state.hover) {
            return;
        }

        // update style
        edge.state.hover = false;
        this.updateEdgeStyleByKey(id);
        this.requestRender();
    }

    /**
     * Disable hover state for given node
     *
     * @param id id of node to unhover
     */
    private unhoverNode(id: string): void {
        const node = this.nodeMap.get(id);
        if (!node.state.hover) {
            return;
        }

        // update style
        node.state.hover = false;
        this.updateNodeStyleByKey(id);
        this.requestRender();
    }

    /**
     * Update edge style
     *
     * @param id id of edge to update
     * @param attributes edge attributes
     * @param source source node ID
     * @param target target node ID
     * @param sourceNodeAttributes source node attributes
     * @param targetNodeAttributes target node attributes
     */
    private updateEdgeStyle(
        id: string,
        attributes: SimulationEdge,
        source: string,
        target: string,
        sourceNodeAttributes: SimulationNode,
        targetNodeAttributes: SimulationNode
    ): void {
        const edge = this.edgeMap.get(id);

        if (edge && this.viewport) {
            const sourceNode = this.nodeMap.get(source);
            const targetNode = this.nodeMap.get(target);

            const isSourceGroupNode = sourceNodeAttributes.variable_type === 'groupNode';
            const isTargetGroupNode = targetNodeAttributes.variable_type === 'groupNode';

            // Recompute edge position
            const sourceNodePosition = { x: sourceNodeAttributes.x, y: sourceNodeAttributes.y };
            const targetNodePosition = { x: targetNodeAttributes.x, y: targetNodeAttributes.y };
            const edgeStyle = this.getEdgeStyle(edge, attributes, this.getConstraint(source, target));
            edge.updatePosition(
                edgeStyle,
                sourceNodePosition,
                targetNodePosition,
                sourceNode.nodeGfx.width,
                targetNode.nodeGfx.width,
                this.viewport,
                this.textureCache,
                isSourceGroupNode,
                isTargetGroupNode
            );
        }
    }

    /**
     * Update style for given edge
     *
     * @param edgeKey id of edge to update
     */
    private updateEdgeStyleByKey(edgeKey: string): void {
        const edgeAttributes = this.graph.getEdgeAttributes(edgeKey);
        const sourceNodeKey = this.graph.source(edgeKey);
        const targetNodeKey = this.graph.target(edgeKey);
        const sourceNodeAttributes = this.graph.getNodeAttributes(sourceNodeKey);
        const targetNodeAttributes = this.graph.getNodeAttributes(targetNodeKey);
        this.updateEdgeStyle(
            edgeKey,
            edgeAttributes,
            sourceNodeKey,
            targetNodeKey,
            sourceNodeAttributes,
            targetNodeAttributes
        );
    }

    /**
     * Update visibility of graph parts.
     *
     * Applies culling to hide off-screen graphics, updates LOD based on zoom level
     */
    private updateGraphVisibility(): void {
        const cull = new Cull();
        cull.addAll((this.viewport.children as PIXI.Container[]).flatMap((layer) => layer.children));
        cull.cull(this.app.renderer.screen);

        const zoomState = getZoomState(this.viewport.scale.x, this.zoomThresholds);

        this.graph.forEachNode((nodeKey) => {
            const node = this.nodeMap.get(nodeKey);

            if (node) {
                node.updateVisibility(zoomState);
            }
        });

        this.graph.forEachEdge((edgeKey, edgeAttributes) => {
            const edge = this.edgeMap.get(edgeKey);
            if (edge) {
                edge.updateVisibility(zoomState, edgeAttributes.points !== undefined);

                // For edges we also update styles as the edge lengths are dependant on node positions
                // which changes based on the scale
                this.updateEdgeStyleByKey(edgeKey);
            }
        });
    }

    /**
     * Recompute the layout and apply it
     */
    private async updateLayout(retry: boolean = false): Promise<void> {
        // Cleanup previous layout
        this.onCleanup?.();

        try {
            // Store the old size to avoid recalculating layout if the size hasn't changed
            this.graph.updateAttribute('extras', (prev) => ({
                ...prev,
                bounds: { width: this.container.clientWidth, height: this.container.clientHeight },
            }));
            const { layout, edgePoints, onStartDrag, onEndDrag, onCleanup, onMove, onAddNode, onAddEdge } =
                await this.layout.applyLayout(this.graph, (l, e) => this.setLayout(l, e, false));
            this.onAddNode = onAddNode;
            this.onAddEdge = onAddEdge;
            this.onStartDrag = onStartDrag;
            this.onEndDrag = onEndDrag;
            this.onCleanup = onCleanup;
            this.onMove = onMove;

            this.setLayout(layout, edgePoints);
        } catch (e) {
            if (retry) {
                // If we're already retrying, we should stop here to avoid infinite loops
                // This should never happen but is a safety measure
                // eslint-disable-next-line no-console
                console.error('Layout failed even after retrying', e);
                return;
            }
            // TODO: remove console below once we have a nice way of showing more info with the stack trace
            // eslint-disable-next-line no-console
            console.error(e);
            // call error handler
            this.errorHandler({
                key: 'LayoutError',
                message: e.message,
                status: Status.WARNING,
                title: 'Defaulting to Fcose Layout',
            });

            // Check if the current layout has tiers and orientation, and store them if it does
            let tiers;
            let orientation;
            if (isGraphLayoutWithTiers(this.layout)) {
                tiers = this.layout.tiers;
                orientation = this.layout.orientation;
            }

            // Rebuild the layout
            this.layout = FcoseLayout.Builder.nodeSize(this.layout.nodeSize)
                .nodeFontSize(this.layout.nodeFontSize)
                .build();

            // Reassign tiers and orientation to the new layout if they were present in the old layout
            if (tiers !== undefined) {
                (this.layout as GraphLayoutWithTiers).tiers = tiers;
                (this.layout as GraphLayoutWithTiers).orientation = orientation;
            }

            this.updateLayout(true);
        }
    }

    /**
     * Update style of given node
     *
     * @param id id of node to update
     * @param attributes node attributes
     */
    private updateNodeStyle(id: string, attributes: SimulationNode): void {
        const node = this.nodeMap.get(id);

        if (node) {
            const nodePosition = { x: attributes.x, y: attributes.y };
            node.updatePosition(nodePosition);
            node.updateStyle(this.getNodeStyle(node, attributes), this.textureCache);
        }
    }

    /**
     * Update style of given group container
     *
     * @param id id of group to update
     * @param nodes array of nodes that are part of the group
     */
    private updateGroupContainerStyle(id: string, nodes: SimulationNode[]): void {
        const groupContainer = this.groupContainerMap.get(id);

        if (groupContainer) {
            groupContainer.updateStyle(nodes, this.textureCache, this.theme);
        }
    }

    /**
     * Update style for given node
     *
     * @param nodeKey id of node to update
     */
    private updateNodeStyleByKey(nodeKey: string): void {
        const nodeAttributes = this.graph.getNodeAttributes(nodeKey);
        this.updateNodeStyle(nodeKey, nodeAttributes);
    }

    /**
     * Recalculate current strength range based on thickness properties
     */
    private updateStrengthRange(): void {
        const thicknessValues = this.graph
            .mapEdges((nodeKey) => this.graph.getEdgeAttribute(nodeKey, 'meta.rendering_properties.thickness'))
            .filter((x) => x !== undefined);

        if (thicknessValues.length < 2) {
            this.strengthRange = null;
            return;
        }

        const min = Math.min(...thicknessValues);
        const max = Math.max(...thicknessValues);

        this.strengthRange = [min, max];
    }

    /**
     * Update the visuals of each node, edge and group containers
     */
    private updateStyles(): void {
        this.graph.forEachNode(this.updateNodeStyle.bind(this));
        this.graph.forEachEdge(this.updateEdgeStyle.bind(this));

        if (isGraphLayoutWithGroups(this.layout)) {
            const { group } = this.layout;
            const groupsObject = getGroupToNodesMap(this.graph.nodes(), group, this.graph);
            Object.keys(groupsObject).forEach((gr) => {
                const nodesIngroup = groupsObject[gr].map((node) => this.graph.getNodeAttributes(node));
                this.updateGroupContainerStyle(gr, nodesIngroup);
            });
        }
    }
}
