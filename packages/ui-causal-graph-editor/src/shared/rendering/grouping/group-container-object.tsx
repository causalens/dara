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
import * as PIXI from 'pixi.js';

import { DefaultTheme } from '@darajs/styled-components';

import { DEFAULT_NODE_SIZE, TARGET_NODE_MULTIPLIER } from '@shared/utils';

import { SimulationNode } from '@types';

import { TextureCache } from '../texture-cache';
import { MOUSE_EVENTS, colorToPixi, createKey } from '../utils';

const GROUP_RECTANGLE = 'GROUP_RECTANGLE';
const GROUP_BORDER = 'GROUP_BORDER';

/**
 * Represents a drawn Group Container object
 */
export class GroupContainerObject extends PIXI.utils.EventEmitter<(typeof MOUSE_EVENTS)[number]> {
    groupContainerGfx: PIXI.Container;

    constructor() {
        super();
        this.groupContainerGfx = this.createGroupContainer();
    }

    /**
     * Create a new group container, including sprites for:
     * - rectangle
     * - border
     */
    private createGroupContainer(): PIXI.Container<PIXI.DisplayObject> {
        const groupContainerGfx = new PIXI.Container();
        groupContainerGfx.interactive = true;
        groupContainerGfx.cursor = 'pointer';

        groupContainerGfx.hitArea = new PIXI.Rectangle(0, 0);

        // send mouse events up
        MOUSE_EVENTS.forEach((eventName) => {
            groupContainerGfx.addEventListener(eventName, (event) => this.emit(eventName, event));
        });

        // rectangle
        const containerRectangle = new PIXI.Sprite();
        containerRectangle.name = GROUP_RECTANGLE;
        containerRectangle.anchor.set(0.5);
        groupContainerGfx.addChild(containerRectangle);

        // border
        const containerBorder = new PIXI.Sprite();
        containerBorder.name = GROUP_BORDER;
        containerBorder.anchor.set(0.5);
        groupContainerGfx.addChild(containerBorder);

        return groupContainerGfx;
    }

    /**
     * Update container style of a given groupContainerGfx container
     *
     * @param groupContainerGfx group container graphics pixi container
     * @param nodes list of simulation nodes
     * @param textureCache texture cache instance
     */
    static updateContainerStyle(
        groupContainerGfx: PIXI.Container,
        nodes: SimulationNode[],
        textureCache: TextureCache,
        theme: DefaultTheme
    ): void {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        nodes.forEach((node) => {
            let radius = node['meta.rendering_properties.size'] ?? DEFAULT_NODE_SIZE * TARGET_NODE_MULTIPLIER;
            radius += 20; // Add padding
            minX = Math.min(minX, node.x - radius);
            maxX = Math.max(maxX, node.x + radius);
            minY = Math.min(minY, node.y - radius);
            maxY = Math.max(maxY, node.y + radius);
        });

        const height = maxY - minY;
        const width = maxX - minX;

        // Adjust hit area
        (groupContainerGfx.hitArea as PIXI.Rectangle).x = -width / 2;
        (groupContainerGfx.hitArea as PIXI.Rectangle).y = -height / 2;

        (groupContainerGfx.hitArea as PIXI.Rectangle).width = width;
        (groupContainerGfx.hitArea as PIXI.Rectangle).height = height;

        // Get/create rectangle texture
        const rectangleTexture = textureCache.get(createKey(GROUP_RECTANGLE, minX, maxX, minY, maxY), () => {
            const graphics = new PIXI.Graphics();
            graphics.lineStyle(2, theme.colors.primary.replace('#', '0x'), 0.5); // Half-transparent border
            graphics.beginFill(theme.colors.blue2.replace('#', '0x'), 1);
            graphics.drawRoundedRect(minX, minY, width, height, 8);
            graphics.endFill();
            return graphics;
        });

        // Set the node texture and adjust its styles
        const rectangle = groupContainerGfx.getChildByName<PIXI.Sprite>(GROUP_RECTANGLE);
        rectangle.texture = rectangleTexture;
        [rectangle.tint, rectangle.alpha] = colorToPixi(theme.colors.blue2);
    }

    /**
     * Moves all group container graphics to given position
     *
     * @param position position to move to
     */
    updatePosition(position: PIXI.IPointData): void {
        this.groupContainerGfx.position.copyFrom(position);
    }

    /**
     * Update styles of all group container graphics
     *
     * @param nodeStyle current node style
     * @param textureCache texture cache instance
     */
    updateStyle(nodes: SimulationNode[], textureCache: TextureCache, theme: DefaultTheme): void {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        nodes.forEach((node) => {
            let radius = node['meta.rendering_properties.size'] ?? DEFAULT_NODE_SIZE * TARGET_NODE_MULTIPLIER;
            radius += 20; // Add padding

            minX = Math.min(minX, node.x - radius);
            maxX = Math.max(maxX, node.x + radius);
            minY = Math.min(minY, node.y - radius);
            maxY = Math.max(maxY, node.y + radius);
        });

        const centerX = minX + (maxX - minX) / 2;
        const centerY = minY + (maxY - minY) / 2;

        GroupContainerObject.updateContainerStyle(this.groupContainerGfx, nodes, textureCache, theme);
        this.groupContainerGfx.position.copyFrom({ x: centerX, y: centerY });
    }
}
