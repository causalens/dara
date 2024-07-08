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
import { DropShadowFilter } from '@pixi/filter-drop-shadow';
import { SmoothGraphics } from '@pixi/graphics-smooth';
import * as PIXI from 'pixi.js';

import { ZoomState } from '@types';

import { SHADOWS } from '../colors';
import { getTextStyle, trimToFit } from '../text';
import { TextureCache } from '../texture-cache';
import { MOUSE_EVENTS, colorToPixi, createKey } from '../utils';
import { BORDER_PADDING, NodeState, PixiNodeStyle } from './definitions';
import { getNodeColor, getNodeSize } from './utils';

const NODE_CIRCLE = 'NODE_CIRCLE';
const NODE_BORDER = 'NODE_BORDER';
const NODE_LABEL = 'NODE_LABEL';
const NODE_SQUARE = 'NODE_SQUARE';
const NODE_SQUARE_BORDER = 'NODE_SQUARE_BORDER';

/**
 * Represents a drawn Node object
 */
export class NodeObject extends PIXI.utils.EventEmitter<(typeof MOUSE_EVENTS)[number]> {
    nodeGfx: PIXI.Container;

    nodeLabelGfx: PIXI.Container;

    /**
     * Current node state
     */
    state: NodeState = {
        attachedEdgeSelected: false,
        hover: false,
        matched: false,
        selected: false,
    };

    constructor() {
        super();
        this.nodeGfx = this.createNode();
        this.nodeLabelGfx = this.createNodeLabel();
    }

    /**
     * Create a new node container, including sprites for:
     * - circle
     * - border
     */
    private createNode(): PIXI.Container<PIXI.DisplayObject> {
        const nodeGfx = new PIXI.Container();
        nodeGfx.interactive = true;
        nodeGfx.cursor = 'pointer';

        nodeGfx.hitArea = new PIXI.Circle(0, 0);

        // send mouse events up
        MOUSE_EVENTS.forEach((eventName) => {
            nodeGfx.addEventListener(eventName, (event) => this.emit(eventName, event));
        });

        // circle
        const nodeCircle = new PIXI.Sprite();
        nodeCircle.name = NODE_CIRCLE;
        nodeCircle.anchor.set(0.5);
        nodeGfx.addChild(nodeCircle);

        // square
        const nodeSquare = new PIXI.Sprite();
        nodeSquare.name = NODE_SQUARE;
        nodeSquare.anchor.set(0.5);
        nodeGfx.addChild(nodeSquare);

        // border
        const nodeBorder = new PIXI.Sprite();
        nodeBorder.name = NODE_BORDER;
        nodeBorder.anchor.set(0.5);
        nodeGfx.addChild(nodeBorder);

        // square border
        const nodeSquareBorder = new PIXI.Sprite();
        nodeSquareBorder.name = NODE_SQUARE_BORDER;
        nodeSquareBorder.anchor.set(0.5);
        nodeGfx.addChild(nodeSquareBorder);

        return nodeGfx;
    }

    /**
     * Create a new node label, including a sprite for the text
     */
    private createNodeLabel(): PIXI.Container<PIXI.DisplayObject> {
        const nodeLabelGfx = new PIXI.Container();
        nodeLabelGfx.interactive = true;
        nodeLabelGfx.cursor = 'pointer';

        // send mouse events up
        MOUSE_EVENTS.forEach((eventName) => {
            nodeLabelGfx.addEventListener(eventName, (event) => this.emit(eventName, event));
        });

        // nodeLabelGfx -> nodeLabelText
        const nodeLabelText = new PIXI.Sprite();
        nodeLabelText.name = NODE_LABEL;
        nodeLabelText.anchor.set(0.5);
        nodeLabelGfx.addChild(nodeLabelText);

        return nodeLabelGfx;
    }

    /**
     * Update node style of a given nodeGfx container
     *
     * @param nodeGfx node graphics container
     * @param nodeStyle current node style
     * @param textureCache texture cache instance
     */
    static updateNodeStyle(nodeGfx: PIXI.Container, nodeStyle: PixiNodeStyle, textureCache: TextureCache): void {
        const borderWidth = nodeStyle.state.matched ? 4 : 1;

        const outerRadius = nodeStyle.size + borderWidth;

        // Adjust hit area
        (nodeGfx.hitArea as PIXI.Circle).radius = outerRadius;

        // Create filter the first time
        if (!nodeGfx.filters || nodeGfx.filters.length === 0) {
            nodeGfx.filters = [new DropShadowFilter({ offset: { x: 0, y: 0 } })];
        }
        const dropShadow = nodeGfx.filters[0] as DropShadowFilter;

        const nodeTextureKey = nodeStyle.isGroupNode ? NODE_SQUARE : NODE_CIRCLE;
        const nodeBorderTextureKey = nodeStyle.isGroupNode ? NODE_SQUARE_BORDER : NODE_BORDER;

        // Get/create circle texture
        const nodeTexture = textureCache.get(createKey(nodeTextureKey, nodeStyle.size), () => {
            const graphics = new SmoothGraphics();
            graphics.beginFill(0xffffff, 1, true);

            if (nodeStyle.isGroupNode) {
                graphics.drawRoundedRect(nodeStyle.size, nodeStyle.size, 2 * nodeStyle.size, 2 * nodeStyle.size, 8);
            } else {
                graphics.drawCircle(nodeStyle.size, nodeStyle.size, nodeStyle.size);
            }
            return graphics;
        });

        // Set the node texture and adjust its styles
        const nodeBody = nodeGfx.getChildByName<PIXI.Sprite>(nodeTextureKey);
        nodeBody.texture = nodeTexture;
        [nodeBody.tint, nodeBody.alpha] = colorToPixi(nodeStyle.color);

        // Get/create border texture
        const borderTexture = textureCache.get(
            createKey(nodeBorderTextureKey, outerRadius, borderWidth, nodeStyle.size),
            () => {
                const graphics = new SmoothGraphics();
                graphics.lineStyle({ color: 0xffffff, width: borderWidth });
                if (nodeStyle.isGroupNode) {
                    graphics.drawRoundedRect(outerRadius, outerRadius, 2 * nodeStyle.size, 2 * nodeStyle.size, 8);
                } else {
                    graphics.drawCircle(outerRadius, outerRadius, nodeStyle.size);
                }
                return graphics;
            },
            BORDER_PADDING
        );

        // Set the border texture and adjust its styles
        const border = nodeGfx.getChildByName<PIXI.Sprite>(nodeBorderTextureKey);
        border.texture = borderTexture;
        [border.tint, border.alpha] = colorToPixi(nodeStyle.highlight_color);

        // Adjust the filter style based on state
        const themeShadows = SHADOWS[nodeStyle.theme.themeType];
        let shadowColor = themeShadows.shadowNormal;
        let blur = 2;

        if (nodeStyle.state.selected) {
            shadowColor = nodeStyle.highlight_color;
            blur = 4;
        } else if (nodeStyle.state.hover || nodeStyle.isSourceOfNewEdge) {
            shadowColor = themeShadows.shadowHover;
            blur = 4;
        }

        [dropShadow.color, dropShadow.alpha] = colorToPixi(shadowColor);
        dropShadow.blur = blur;
        dropShadow.padding = 10;

        // If selection is active but the node itself is not selected or hovered, adjust opacity
        if (
            nodeStyle.isEdgeSelected &&
            !nodeStyle.state.selected &&
            !nodeStyle.state.attachedEdgeSelected &&
            !nodeStyle.state.hover &&
            !nodeStyle.isSourceOfNewEdge
        ) {
            nodeBody.alpha = 0.3;
            border.alpha = 0.3;
        }
    }

    /**
     * Update node style of a given nodeLabelGfx container
     *
     * @param nodeLabelGfx node label graphics container
     * @param nodeStyle current node style
     * @param textureCache texture cache instance
     */
    static updateNodeLabelStyle(
        nodeLabelGfx: PIXI.Container,
        nodeStyle: PixiNodeStyle,
        textureCache: TextureCache
    ): void {
        // Get/create label texture
        const labelTexture = textureCache.get(
            createKey(NODE_LABEL, nodeStyle.label, nodeStyle.size, nodeStyle.category),
            () => {
                const nodeRadius = getNodeSize(nodeStyle.size, nodeStyle.category);
                const nodeSize = nodeRadius * 2;
                const maxSize = nodeSize - 10; // leave space on sides

                const textStyle = getTextStyle(nodeStyle.label_size);
                const trimmedText = trimToFit(nodeStyle.label, maxSize, textStyle);

                const txt = new PIXI.Text(trimmedText, textStyle);
                txt.resolution *= 2;

                return txt;
            }
        );

        const nodeLabel = nodeLabelGfx.getChildByName<PIXI.Sprite>(NODE_LABEL);
        nodeLabel.texture = labelTexture;
        [nodeLabel.tint, nodeLabel.alpha] = colorToPixi(nodeStyle.label_color);

        // If selection is active but the node itself is not selected, adjust opacity
        if (
            nodeStyle.isEdgeSelected &&
            !nodeStyle.state.selected &&
            !nodeStyle.state.attachedEdgeSelected &&
            !nodeStyle.state.hover &&
            !nodeStyle.isSourceOfNewEdge
        ) {
            nodeLabel.alpha = 0.3;
        }
    }

    /**
     * Update visibility of node elements based on zoomstep
     *
     * @param nodeGfx node graphics container
     * @param zoomStep zoom step
     */
    static updateNodeVisibility(nodeGfx: PIXI.Container, zoomState: ZoomState, state: NodeState): void {
        const shadow = nodeGfx.filters[0] as DropShadowFilter;

        // keep shadow if node is selected
        shadow.enabled = zoomState.shadow || state.selected;
    }

    /**
     * Update visibility of node label elements based on zoomstep
     *
     * @param nodeGfx node label graphics container
     * @param zoomStep zoom step
     */
    static updateNodeLabelVisibility(nodeLabelGfx: PIXI.Container, zoomState: ZoomState): void {
        const nodeLabel = nodeLabelGfx.getChildByName<PIXI.Sprite>(NODE_LABEL);
        nodeLabel.visible = nodeLabel.visible && zoomState.label;
    }

    /**
     * Moves all node graphics to given position
     *
     * @param position position to move to
     */
    updatePosition(position: PIXI.IPointData): void {
        this.nodeGfx.position.copyFrom(position);
        this.nodeLabelGfx.position.copyFrom(position);
    }

    /**
     * Update styles of all node graphics
     *
     * @param nodeStyle current node style
     * @param textureCache texture cache instance
     */
    updateStyle(nodeStyle: PixiNodeStyle, textureCache: TextureCache): void {
        const [defaultColor, defaultFontColor] = getNodeColor(nodeStyle.category, nodeStyle.theme);
        // Apply default styles
        nodeStyle.color ??= defaultColor;
        nodeStyle.highlight_color ??= nodeStyle.theme.colors.primary;
        nodeStyle.label_color ??= defaultFontColor;

        NodeObject.updateNodeStyle(this.nodeGfx, nodeStyle, textureCache);
        NodeObject.updateNodeLabelStyle(this.nodeLabelGfx, nodeStyle, textureCache);
    }

    /**
     * Update visibility of node graphics
     *
     * @param zoomStep current zoom step
     */
    updateVisibility(zoomState: ZoomState): void {
        NodeObject.updateNodeVisibility(this.nodeGfx, zoomState, this.state);
        NodeObject.updateNodeLabelVisibility(this.nodeLabelGfx, zoomState);
    }
}
