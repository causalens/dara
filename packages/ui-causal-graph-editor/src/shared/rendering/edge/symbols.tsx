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
import { SmoothGraphics } from '@pixi/graphics-smooth';
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
): SmoothGraphics {
    const gfx = new SmoothGraphics();

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
                gfx.lineStyle({
                    cap: PIXI.LINE_CAP.ROUND,
                    color,
                    width: 2,
                });
                gfx.arc(0, 0, 8, 0, Math.PI, false);
                return gfx;
            }
            // Encoder - only show arrow for directed constraint
            if (style.constraint?.type !== EdgeConstraintType.HARD_DIRECTED) {
                return gfx;
            }
        }

        gfx.lineStyle({ cap: PIXI.LINE_CAP.ROUND, color, width: 2 });
        gfx.moveTo(0, 8);
        gfx.lineTo(-8, 0);
        gfx.moveTo(0, 8);
        gfx.lineTo(8, 0);
    }

    // Multiplier for Y values - flip bottom position graphics
    const my = position === 'top' ? 1 : -1;

    // Pag-style arrow
    if (style.editorMode === EditorMode.PAG_VIEWER) {
        const symbol = style.type[position === 'top' ? 1 : 0];

        // Fill for arrows
        if (['<', '>'].includes(symbol)) {
            gfx.beginFill(color, 1, true);
            gfx.drawPolygon([0, my * 10, -8, 0, 8, 0]);
            gfx.endFill();
        } else if (symbol === 'o') {
            gfx.beginFill(bgTint, 1);
            gfx.drawCircle(0, 0, 6);
            gfx.endFill();

            // stroke for circles
            gfx.lineStyle({ color, width: 3 });
            gfx.drawCircle(0, 0, 5);
        } else {
            // undirected - no symbol
            return gfx;
        }
    }

    return gfx;
}

/**
 * Create a graphics object for the edge strength symbol
 *
 * @param dots number of dots to include in the symbol
 */
export function createStrengthSymbol(dots: number): SmoothGraphics {
    const gfx = new SmoothGraphics();

    if (!dots) {
        return gfx;
    }

    gfx.beginFill(0xffffff, 1, true);

    // Draw a circle for each dot
    for (let i = 0; i < dots; i++) {
        gfx.drawCircle(0, -10 * i, 4);
    }

    gfx.endFill();

    return gfx;
}

/**
 * Create a graphics object for center edge symbol
 *
 * @param style edge style
 */
export function createCenterSymbol(style: PixiEdgeStyle): SmoothGraphics {
    const gfx = new SmoothGraphics();

    // In resolver modes, draw a question mark for unresolved direction edges
    if (EditorMode.RESOLVER === style.editorMode) {
        if (style.type !== EdgeType.DIRECTED_EDGE) {
            gfx.lineStyle({
                cap: PIXI.LINE_CAP.ROUND,
                color: 0xffffff,
                width: 1,
            });
            gfx.beginFill(0xffffff, 1, true);
            drawPath(QUESTION_MARK, gfx);
            gfx.endFill();
        }
    }

    // In edge encoder, show prohibited/undirected in the center
    if (style.editorMode === EditorMode.EDGE_ENCODER && style.constraint) {
        if (style.constraint.type === EdgeConstraintType.FORBIDDEN) {
            gfx.lineStyle({
                cap: PIXI.LINE_CAP.ROUND,
                color: 0xffffff,
                width: 2,
            });
            gfx.moveTo(-6, 6);
            gfx.lineTo(6, -6);
            gfx.moveTo(6, 6);
            gfx.lineTo(-6, -6);
        } else if (style.constraint.type === EdgeConstraintType.UNDIRECTED) {
            gfx.lineStyle({
                cap: PIXI.LINE_CAP.ROUND,
                color: 0xffffff,
                width: 2,
            });
            gfx.moveTo(-8, 4);
            gfx.lineTo(0, 12);
            gfx.lineTo(8, 4);
            gfx.moveTo(-8, -4);
            gfx.lineTo(0, -12);
            gfx.lineTo(8, -4);
        }
    }

    return gfx;
}
