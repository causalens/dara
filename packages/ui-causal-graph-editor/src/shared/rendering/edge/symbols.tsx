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

import { EdgeConstraintType, EdgeType, EditorMode } from '../../../types';
import { QUESTION_MARK, drawPath } from '../svg';
import { PixiEdgeStyle } from './definitions';

/**
 * Create a graphics object for a side (top or bottom) edge symbol
 *
 * @param style edge style
 * @param position position of the object on the edge
 * @param tint tint of the symbol
 * @param bgTint tint of the background behind the symbol, e.g. to make it not transparent
 */
export function createSideSymbol(
    style: PixiEdgeStyle,
    position: 'top' | 'bottom',
    tint: number,
    bgTint: number
): PIXI.Graphics {
    const gfx = new PIXI.Graphics();

    const color = tint;

    // normal arrow in normal/resolver mode
    if ([EditorMode.RESOLVER, EditorMode.DEFAULT, EditorMode.EDGE_ENCODER].includes(style.editorMode)) {
        // Bottom arrows don't exist here
        if (position === 'bottom') {
            return gfx;
        }

        if (EditorMode.RESOLVER === style.editorMode) {
            // Resolver - only show arrow for directed edge
            if (style.type !== EdgeType.DIRECTED_EDGE) {
                return gfx;
            }
        }

        if (style.editorMode === EditorMode.EDGE_ENCODER) {
            // Edge encoder - shows semi-circle tip for soft directed constraint
            if (style.constraint?.type === EdgeConstraintType.SOFT_DIRECTED) {
                gfx.arc(0, 0, 8, 0, Math.PI, false).stroke({
                    cap: 'round',
                    color,
                    width: 2,
                });
                return gfx;
            }
            // Encoder - only show arrow for directed constraint
            if (style.constraint?.type !== EdgeConstraintType.HARD_DIRECTED) {
                return gfx;
            }
        }

        gfx.moveTo(0, 8);
        gfx.lineTo(-8, 0).stroke({ cap: 'round', color, width: 2 });
        gfx.moveTo(0, 8);
        gfx.lineTo(8, 0).stroke({ cap: 'round', color, width: 2 });
    }

    // Multiplier for Y values - flip bottom position graphics
    const my = position === 'top' ? 1 : -1;

    // Pag-style arrow
    if (style.editorMode === EditorMode.PAG_VIEWER) {
        const symbol = style.type[position === 'top' ? 1 : 0];

        // Fill for arrows
        if (['<', '>'].includes(symbol)) {
            gfx.poly([0, my * 10, -8, 0, 8, 0]).fill(color);
        } else if (symbol === 'o') {
            gfx.circle(0, 0, 6).fill(bgTint).circle(0, 0, 5).stroke({ color, width: 3 });
        } else {
            // undirected - no symbol
            return gfx;
        }

        return gfx;
    }

    return gfx;
}

/**
 * Create a graphics object for the edge strength symbol
 *
 * @param dots number of dots to include in the symbol
 */
export function createStrengthSymbol(dots: number): PIXI.Graphics {
    const gfx = new PIXI.Graphics();

    if (!dots) {
        return gfx;
    }

    // Draw a circle for each dot
    for (let i = 0; i < dots; i++) {
        gfx.circle(0, -10 * i, 4).fill(0xffffff);
    }

    return gfx;
}

/**
 * Create a graphics object for center edge symbol
 *
 * @param style edge style
 */
export function createCenterSymbol(style: PixiEdgeStyle): PIXI.Graphics {
    const gfx = new PIXI.Graphics();

    // In resolver modes, draw a question mark for unresolved direction edges
    if (EditorMode.RESOLVER === style.editorMode) {
        if (style.type !== EdgeType.DIRECTED_EDGE) {
            drawPath(QUESTION_MARK, gfx);
        }
    }

    // In edge encoder, show prohibited/undirected in the center
    if (style.editorMode === EditorMode.EDGE_ENCODER && style.constraint) {
        if (style.constraint.type === EdgeConstraintType.FORBIDDEN) {
                gfx.moveTo(-6, 6)
                .lineTo(6, -6).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                })
                .moveTo(6, 6)
                .lineTo(-6, -6).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                });
        } else if (style.constraint.type === EdgeConstraintType.UNDIRECTED) {
            
                gfx.moveTo(-8, 4)
                .lineTo(0, 12).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                })
                .lineTo(8, 4).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                })
                .moveTo(-8, -4)
                .lineTo(0, -12).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                })
                .lineTo(8, -4).stroke({
                    cap: 'round',
                    color: 0xffffff,
                    width: 2,
                });
        }
    }

    return gfx;
}
