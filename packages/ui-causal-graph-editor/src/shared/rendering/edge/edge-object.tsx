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
import clone from 'lodash/cloneDeep';
import { Viewport } from 'pixi-viewport';
import * as PIXI from 'pixi.js';

import { EdgeType, EditorMode, ZoomState } from '@types';

import { BORDER_PADDING } from '../node/definitions';
import { TextureCache } from '../texture-cache';
import { MOUSE_EVENTS, colorToPixi, createKey } from '../utils';
import { getCirclesAlongCurve, getCurvePoints, getPolygonFromCurve } from './curve';
import { EdgeState, PixiEdgeStyle } from './definitions';
import { createCenterSymbol, createSideSymbol, createStrengthSymbol } from './symbols';
import { calculateSourceBoundPosition, calculateTargetBoundPosition } from './utils';

const EDGE_LINE_SPRITE = 'EDGE_LINE_SPRITE';
const EDGE_LINE_GFX = 'EDGE_LINE_GFX';
const EDGE_TOP_SYMBOL = 'EDGE_TOP_SYMBOL';
const EDGE_CENTER_SYMBOL = 'EDGE_CENTER_SYMBOL';
const EDGE_BOTTOM_SYMBOL = 'EDGE_BOTTOM_SYMBOL';
const EDGE_STRENGTH_SYMBOL = 'EDGE_STRENGTH_SYMBOL';
const EDGE_NUMBER_SYMBOL = 'EDGE_NUMBER_SYMBOL';

const EDGE_OFFSET = 10;
/**
 * Multiplier for global sizes to use when dealing with local coordinates
 */
const LOCAL_MULTIPLIER = 1.5;

export class EdgeObject extends PIXI.utils.EventEmitter<(typeof MOUSE_EVENTS)[number]> {
    edgeGfx: PIXI.Container;

    edgeSymbolsGfx: PIXI.Container;

    /**
     * Current edge state
     */
    state: EdgeState = {
        hover: false,
        selected: false,
    };

    private temporary: boolean;

    constructor(temporary = false) {
        super();
        this.temporary = temporary;
        this.edgeGfx = this.createEdge();
        this.edgeSymbolsGfx = this.createEdgeSymbols();
    }

    private createEdge(): PIXI.Container<PIXI.DisplayObject> {
        const edgeGfx = new PIXI.Container();

        edgeGfx.hitArea = new PIXI.Polygon();

        // Temporary edges don't need to fire events
        if (!this.temporary) {
            edgeGfx.interactive = true;
            edgeGfx.cursor = 'pointer';
            // send mouse events up
            MOUSE_EVENTS.forEach((eventName) => {
                edgeGfx.addEventListener(eventName, (event) => this.emit(eventName, event));
            });
        }

        // edge - is tiled to repeat its texture if it's too long
        const edgeLine = new PIXI.TilingSprite(PIXI.Texture.WHITE);
        edgeLine.name = EDGE_LINE_SPRITE;
        edgeLine.anchor.set(0.5);
        edgeGfx.addChild(edgeLine);

        return edgeGfx;
    }

    /**
     * Create a new edge symbols container, including sprites for:
     * - top symbol - e.g. different arrows
     * - center symbol - e.g. question mark/cross
     * - bottom symbol - e.g. arrows
     * - strength symbol - strength marker circles
     */
    private createEdgeSymbols(): PIXI.Container<PIXI.DisplayObject> {
        const edgeSymbolsGfx = new PIXI.Container();

        if (!this.temporary) {
            edgeSymbolsGfx.interactive = true;
            edgeSymbolsGfx.cursor = 'pointer';
            // send mouse events up
            MOUSE_EVENTS.forEach((eventName) => {
                edgeSymbolsGfx.addEventListener(eventName, (event) => this.emit(eventName, event));
            });
        }

        const edgeTopSymbol = new PIXI.Sprite();
        edgeTopSymbol.name = EDGE_TOP_SYMBOL;
        edgeTopSymbol.anchor.set(0.5);
        edgeSymbolsGfx.addChild(edgeTopSymbol);

        const edgeCenterSymbol = new PIXI.Sprite();
        edgeCenterSymbol.name = EDGE_CENTER_SYMBOL;
        edgeCenterSymbol.anchor.set(0.5);
        edgeSymbolsGfx.addChild(edgeCenterSymbol);

        const edgeBottomSymbol = new PIXI.Sprite();
        edgeBottomSymbol.name = EDGE_BOTTOM_SYMBOL;
        edgeBottomSymbol.anchor.set(0.5);
        edgeSymbolsGfx.addChild(edgeBottomSymbol);

        const edgeStrengthSymbol = new PIXI.Sprite();
        edgeStrengthSymbol.name = EDGE_STRENGTH_SYMBOL;
        edgeStrengthSymbol.anchor.set(0.5, 1);
        edgeSymbolsGfx.addChild(edgeStrengthSymbol);

        const edgeSourceNumberSymbol = new PIXI.Sprite();
        edgeSourceNumberSymbol.name = EDGE_NUMBER_SYMBOL;
        edgeSourceNumberSymbol.anchor.set(0.5);
        edgeSymbolsGfx.addChild(edgeSourceNumberSymbol);

        return edgeSymbolsGfx;
    }

    /**
     * Update edge style of a given edgeGfx container
     *
     * @param edgeGfx edge graphics container
     * @param edgeStyle current edge style
     * @param textureCache texture cache instance
     */
    static updateEdgeStyle(edgeGfx: PIXI.Container, edgeStyle: PixiEdgeStyle, textureCache: TextureCache): void {
        if (edgeStyle.points) {
            return;
        }

        let edgeLineSprite = edgeGfx.getChildByName<PIXI.TilingSprite>(EDGE_LINE_SPRITE);
        const edgeLineGfx = edgeGfx.getChildByName<SmoothGraphics>(EDGE_LINE_GFX);

        // create line sprite if it doesn't exist yet (e.g. we were in curved line mode before)
        if (!edgeLineSprite) {
            edgeGfx.removeChild(edgeLineGfx);

            edgeLineSprite = new PIXI.TilingSprite(PIXI.Texture.WHITE);
            edgeLineSprite.name = EDGE_LINE_SPRITE;
            edgeLineSprite.anchor.set(0.5);
            edgeGfx.addChild(edgeLineSprite);
        }

        // Handle dash styles in resolver modes
        let dash: number = null;
        let gapScale = 1;

        if (EditorMode.RESOLVER === edgeStyle.editorMode) {
            const isResolved = edgeStyle.type === EdgeType.DIRECTED_EDGE;

            const LARGE_DASH = 6;
            const SMALL_DASH = 2;

            if (!isResolved) {
                // Unresolved
                dash = LARGE_DASH;
            } else if (edgeStyle.forced) {
                // Forced
                dash = null;
            } else if (!edgeStyle.accepted) {
                // Not accepted
                dash = LARGE_DASH;
            } else {
                // Accepted
                dash = SMALL_DASH;
                gapScale = 0.5;
            }
        }

        // Get/create edge line texture
        const edgeLineTexture = textureCache.get(createKey(EDGE_LINE_SPRITE, dash, gapScale), () => {
            const gfx = new PIXI.Graphics();

            gfx.lineStyle({
                color: 0xffffff,
                width: 10,
            });

            // If dash is set, draw a dashed line
            if (dash) {
                gfx.beginFill();
                gfx.moveTo(0, 0);
                gfx.lineTo(0, dash);
                gfx.moveTo(0, dash + 2 * dash * gapScale);
                gfx.lineTo(0, 4 * dash);
                gfx.endFill();
            } else {
                // Otherwise just a straight line
                gfx.moveTo(0, 0);
                gfx.lineTo(0, 300);
            }

            return gfx;
        });

        edgeLineSprite.texture = edgeLineTexture;
        edgeLineSprite.width = edgeStyle.strength?.thickness ?? 3;

        // Make sure to only update if edgeGfx already has a height set, it could be NaN at first renders
        // only if dash is set, we need to update the height - to prevent stretching dashes
        if (edgeGfx.height && dash) {
            edgeLineSprite.height = edgeGfx.height;
        }

        [edgeLineSprite.tint] = colorToPixi(edgeStyle.color);

        // Add opacity in default state
        if (edgeStyle.state.hover || edgeStyle.state.selected) {
            edgeLineSprite.alpha = 1;
        } else {
            edgeLineSprite.alpha = edgeStyle.strength?.opacity ?? 0.5;
        }

        // The hit area is a rectangle drawn as a polygon
        // the `y` dimension is aligned with edge height
        // the `x` dimension controls the buffer
        const buffer = 6;
        const yOffset = edgeLineSprite.height / 2;
        (edgeGfx.hitArea as PIXI.Polygon).points = [
            edgeLineSprite.position.x - buffer,
            edgeLineSprite.position.y - yOffset,
            edgeLineSprite.position.x - buffer,
            edgeLineSprite.position.y + yOffset,
            edgeLineSprite.position.x + buffer,
            edgeLineSprite.position.y + yOffset,
            edgeLineSprite.position.x + buffer,
            edgeLineSprite.position.y - yOffset,
        ];

        // If selection is active but the edge itself is not selected, adjust opacity
        if (edgeStyle.isEdgeSelected && !edgeStyle.state.selected && !edgeStyle.state.hover) {
            edgeLineSprite.alpha = 0.3;
        }
    }

    /**
     * Update edge style of a given edgeSymbolsGfx container
     *
     * @param edgeGfx edge graphics container
     * @param edgeSymbolsGfx edge symbols graphics container
     * @param edgeStyle current edge style
     * @param textureCache texture cache instance
     */
    static updateEdgeSymbolsStyle(
        edgeGfx: PIXI.Container,
        edgeSymbolsGfx: PIXI.Container,
        edgeStyle: PixiEdgeStyle,
        textureCache: TextureCache
    ): void {
        // Top
        const edgeTopSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_TOP_SYMBOL);

        const [tint] = colorToPixi(edgeStyle.color);
        const [bgTint] = colorToPixi(edgeStyle.theme.colors.blue1);
        const topSymbolTexture = textureCache.get(
            createKey(EDGE_TOP_SYMBOL, edgeStyle.editorMode, edgeStyle.type, tint, bgTint, edgeStyle.constraint?.type),
            () => createSideSymbol(edgeStyle, 'top', tint, bgTint),
            1
        );
        edgeTopSymbol.texture = topSymbolTexture;
        edgeTopSymbol.position.y = edgeGfx.height / 2 - EDGE_OFFSET;

        edgeTopSymbol.alpha = 1;

        // Center
        const edgeCenterSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_CENTER_SYMBOL);

        const centerSymbolTexture = textureCache.get(
            createKey(EDGE_CENTER_SYMBOL, edgeStyle.editorMode, edgeStyle.type, edgeStyle.constraint?.type),
            () => createCenterSymbol(edgeStyle)
        );
        edgeCenterSymbol.texture = centerSymbolTexture;
        [edgeCenterSymbol.tint] = colorToPixi(edgeStyle.color);
        edgeCenterSymbol.alpha = 1;

        // Question mark should be un-rotated (always vertical)
        if (EditorMode.RESOLVER === edgeStyle.editorMode && edgeStyle.type !== EdgeType.DIRECTED_EDGE) {
            edgeCenterSymbol.rotation = -1 * edgeGfx.rotation;
        }

        // Bottom
        const edgeBottomSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_BOTTOM_SYMBOL);

        const bottomSymbolTexture = textureCache.get(
            createKey(
                EDGE_BOTTOM_SYMBOL,
                edgeStyle.editorMode,
                edgeStyle.type,
                tint,
                bgTint,
                edgeStyle.constraint?.type
            ),
            () => createSideSymbol(edgeStyle, 'bottom', tint, bgTint),
            1
        );
        edgeBottomSymbol.texture = bottomSymbolTexture;
        edgeBottomSymbol.position.y = -1 * edgeTopSymbol.position.y;
        edgeBottomSymbol.alpha = 1;

        // Strength symbols
        const edgeStrengthSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_STRENGTH_SYMBOL);

        const strengthSymbolTexture = textureCache.get(createKey(EDGE_STRENGTH_SYMBOL, edgeStyle.strength?.dots), () =>
            createStrengthSymbol(edgeStyle.strength?.dots)
        );
        edgeStrengthSymbol.texture = strengthSymbolTexture;
        edgeStrengthSymbol.position.y = edgeTopSymbol.position.y - 5; // leave gap from arrow
        [edgeStrengthSymbol.tint] = colorToPixi(edgeStyle.color);
        edgeStrengthSymbol.alpha = 1;

        // Number symbols
        const edgeNumberSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_NUMBER_SYMBOL);
        const numberSymbolTexture = textureCache.get(
            createKey(EDGE_NUMBER_SYMBOL, edgeStyle.collapsedEdgesCount),
            () => {
                if (edgeStyle.collapsedEdgesCount === undefined) {
                    return new PIXI.Graphics();
                }

                const textStyle = new PIXI.TextStyle({
                    fontFamily: 'Manrope',
                    fontSize: 18,
                    fill: colorToPixi(edgeStyle.color),
                });
                const text = new PIXI.Text(edgeStyle.collapsedEdgesCount, textStyle);
                return text;
            }
        );

        edgeNumberSymbol.texture = numberSymbolTexture;
        edgeNumberSymbol.position.y = edgeTopSymbol.position.y - 30;
        // Depending on the edge rotation, we need to rotate the number symbol so that they appear upright to the user
        edgeNumberSymbol.rotation =
            (
                (edgeGfx.rotation <= Math.PI / 2 && edgeGfx.rotation > 0) ||
                (edgeGfx.rotation >= (-3 * Math.PI) / 2 && edgeGfx.rotation < -Math.PI)
            ) ?
                -Math.PI / 2
            :   Math.PI / 2;
        [edgeStrengthSymbol.tint] = colorToPixi(edgeStyle.color);
        edgeNumberSymbol.alpha = 1;

        // If selection is active but the edge itself is not selected, adjust opacity
        if (edgeStyle.isEdgeSelected && !edgeStyle.state.selected && !edgeStyle.state.hover) {
            edgeCenterSymbol.alpha = 0.3;
            edgeBottomSymbol.alpha = 0.3;
            edgeTopSymbol.alpha = 0.3;
            edgeStrengthSymbol.alpha = 0.3;
        }
    }

    /**
     * Update visibility of edge elements based on zoomstep
     *
     * @param edgeGfx edge graphics container
     * @param zoomStep zoom step
     */
    static updateEdgeVisibility(edgeGfx: PIXI.Container, zoomState: ZoomState, state: EdgeState): void {
        const edgeLine = edgeGfx.getChildByName<PIXI.Sprite>(EDGE_LINE_SPRITE);
        const edgeLineGfx = edgeGfx.getChildByName<PIXI.Graphics>(EDGE_LINE_GFX);

        // Hide edge sprite / graphics based on zoom
        if (edgeLine) {
            edgeLine.visible = zoomState.edge;
        }
        if (edgeLineGfx) {
            edgeLineGfx.visible = zoomState.edge;
        }

        // Create filter the first time
        if (!edgeGfx.filters || edgeGfx.filters.length === 0) {
            const shadowFilter = new DropShadowFilter({ blur: 3, offset: { x: 0, y: 0 } });
            [shadowFilter.color, shadowFilter.alpha] = colorToPixi('rgba(0, 0, 0, 0.5)');
            edgeGfx.filters = [shadowFilter];
        }
        const dropShadow = edgeGfx.filters[0] as DropShadowFilter;

        // Only show at high zoom and when hovered
        dropShadow.enabled = state.hover && zoomState.shadow;
    }

    /**
     * Update visibility of edge symbol elements based on zoomstep
     *
     * @param edgeSymbolsGfx edge symbol graphics container
     * @param zoomStep zoom step
     */
    static updateEdgeSymbolVisibility(edgeSymbolsGfx: PIXI.Container, zoomState: ZoomState, hasPoints: boolean): void {
        const edgeTopSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_TOP_SYMBOL);
        const edgeCenterSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_CENTER_SYMBOL);
        const edgeBottomSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_BOTTOM_SYMBOL);
        const edgeStrengthSymbol = edgeSymbolsGfx.getChildByName<PIXI.Sprite>(EDGE_STRENGTH_SYMBOL);

        edgeTopSymbol.visible = !hasPoints && edgeTopSymbol.visible && zoomState.symbol;
        edgeCenterSymbol.visible = !hasPoints && edgeCenterSymbol.visible && zoomState.symbol;
        edgeBottomSymbol.visible = !hasPoints && edgeBottomSymbol.visible && zoomState.symbol;
        edgeStrengthSymbol.visible = !hasPoints && edgeStrengthSymbol.visible && zoomState.symbol;
    }

    /**
     * Update position of the edge
     *
     * @param edgeStyle current edge style
     * @param sourceNodePosition source node center position
     * @param targetNodePosition target node center position
     * @param sourceSize source node diameter
     * @param targetSize target node diameter
     * @param viewport viewport
     * @param textureCache texture cache
     */
    updatePosition(
        edgeStyle: PixiEdgeStyle,
        sourceNodePosition: PIXI.IPointData,
        targetNodePosition: PIXI.IPointData,
        sourceSize: number,
        targetSize: number,
        viewport: Viewport,
        textureCache: TextureCache,
        isSourceSquare?: boolean,
        isTargetSquare?: boolean
    ): void {
        // Edge angle, this goes from -pi to pi inclusive
        // Math.atan2 is measured at the centre of the source node, and anticlockwise from the x-axis
        const rotation = Math.atan2(
            targetNodePosition.y - sourceNodePosition.y,
            targetNodePosition.x - sourceNodePosition.x
        );

        const sourceRadius = (sourceSize - BORDER_PADDING) / 2;
        const targetRadius = (targetSize - BORDER_PADDING) / 2;

        let targetBoundPosition;
        let sourceBoundPosition;

        if (isTargetSquare) {
            targetBoundPosition = calculateTargetBoundPosition(
                targetNodePosition.x,
                targetNodePosition.y,
                rotation,
                targetSize - BORDER_PADDING
            );
        } else {
            // we transform the x and y positions to be at the edge of the circumference of the node
            //  note that here is minus because the target node receives the line by a 180 degree rotation
            targetBoundPosition = {
                x: targetNodePosition.x - Math.cos(rotation) * targetRadius,
                y: targetNodePosition.y - Math.sin(rotation) * targetRadius,
            };
        }

        if (isSourceSquare) {
            sourceBoundPosition = calculateSourceBoundPosition(
                sourceNodePosition.x,
                sourceNodePosition.y,
                rotation,
                sourceSize - BORDER_PADDING
            );
        } else {
            // we transform the x and y positions to be at the edge of the circumference of the node
            sourceBoundPosition = {
                x: sourceNodePosition.x + Math.cos(rotation) * sourceRadius,
                y: sourceNodePosition.y + Math.sin(rotation) * sourceRadius,
            };
        }

        // Edge centre should be between the two bounds
        const position = {
            x: (sourceBoundPosition.x + targetBoundPosition.x) / 2,
            y: (sourceBoundPosition.y + targetBoundPosition.y) / 2,
        };

        // Length is distance between the bounds (not centers, otherwise the edge is visible under the node when it's dimmed)
        const length = Math.hypot(
            targetBoundPosition.x - sourceBoundPosition.x,
            targetBoundPosition.y - sourceBoundPosition.y
        );

        this.edgeGfx.position.copyFrom(position);
        // not sure why we need to rotate by -90 degrees, but it works
        this.edgeGfx.rotation = rotation - Math.PI / 2;

        // Put symbols in the center and align rotation to the line
        this.edgeSymbolsGfx.position.copyFrom(position);
        this.edgeSymbolsGfx.rotation = rotation - Math.PI / 2;

        // Default styles
        edgeStyle.color ??= edgeStyle.theme.colors.grey5;

        // call render if there are points
        if (edgeStyle.points) {
            // Keep scale equal
            this.edgeGfx.scale.x = 1;
            this.edgeGfx.scale.y = 1;

            // Keep curved edge visuals up-to-date
            this.renderCurvedEdge(edgeStyle, sourceBoundPosition, targetBoundPosition, viewport);
        } else {
            this.edgeGfx.height = length;

            this.updateStyle(edgeStyle, textureCache);
        }
    }

    /**
     * Render a curved edge.
     *
     * Should be called on each render.
     *
     * @param edgeStyle current edge style
     * @param sourceBoundPosition source node bound position
     * @param targetBoundPosition target node bound position
     * @param viewport viewport
     */
    private renderCurvedEdge(
        edgeStyle: PixiEdgeStyle,
        sourceBoundPosition: PIXI.IPointData,
        targetBoundPosition: PIXI.IPointData,
        viewport: Viewport
    ): void {
        if (!edgeStyle.points) {
            return;
        }

        edgeStyle.color ??= edgeStyle.theme.colors.grey5;

        const { edgeGfx } = this;
        const edgeLineSprite = edgeGfx.getChildByName<PIXI.TilingSprite>(EDGE_LINE_SPRITE);
        let edgeLineGfx = edgeGfx.getChildByName<SmoothGraphics>(EDGE_LINE_GFX);

        if (!edgeLineGfx) {
            edgeGfx.removeChild(edgeLineSprite);

            edgeLineGfx = new SmoothGraphics();
            edgeLineGfx.name = EDGE_LINE_GFX;
            edgeGfx.addChild(edgeLineGfx);
        }

        edgeLineGfx.clear();

        const [color] = colorToPixi(edgeStyle.color);

        // Add opacity in default state
        let alpha;
        if (edgeStyle.state.hover || edgeStyle.state.selected) {
            alpha = 1;
        } else {
            alpha = edgeStyle.strength?.opacity ?? 0.5;
        }
        edgeLineGfx.lineStyle({
            alpha,
            color,
            width: edgeStyle.strength?.thickness ?? 3,
        });

        // Adjust first and last point to be on the edge of the node
        // This is done by moving the point in the direction of the next point by the radius of the node
        const adjustedPoints = clone(edgeStyle.points);

        // Replace first and last point with the node bounds positions
        adjustedPoints[0] = sourceBoundPosition;
        adjustedPoints[adjustedPoints.length - 1] = targetBoundPosition;

        // Transform the global positions to account for the viewport position and scale
        const points = adjustedPoints.map((p) => {
            const globalPoint = new PIXI.Point(
                p.x * viewport.scale.x + viewport.x,
                p.y * viewport.scale.y + viewport.y
            );
            return edgeGfx.toLocal(globalPoint);
        });

        // Calculate cardinal spline points
        const curvePoints = getCurvePoints(points);

        // Draw a line through all the curve points
        edgeLineGfx.moveTo(curvePoints[0].x, curvePoints[0].y);
        curvePoints.slice(1).forEach((p) => {
            edgeLineGfx.lineTo(p.x, p.y);
        });

        // Now create a hitbox as a polygon around the edge
        const hitboxPoints = getPolygonFromCurve(curvePoints);
        edgeGfx.hitArea = new PIXI.Polygon(hitboxPoints);

        // Compute angle at which to offset the arrow from the node/edge intersection
        const arrowMovementAngle = Math.atan2(
            points[points.length - 1].y - points[points.length - 2].y,
            points[points.length - 1].x - points[points.length - 2].x
        );

        // move the arrow at the angle by EDGE_OFFSET (* 1.5, as we're in local coordinates vs global offset, 1.5 is an approximate)
        const arrowCenter = {
            x: points[points.length - 1].x - Math.cos(arrowMovementAngle) * EDGE_OFFSET * LOCAL_MULTIPLIER,
            y: points[points.length - 1].y - Math.sin(arrowMovementAngle) * EDGE_OFFSET * LOCAL_MULTIPLIER,
        };

        // Angle between the two last points of the edge
        const angle = Math.atan2(
            points[points.length - 1].y - points[points.length - 2].y,
            points[points.length - 1].x - points[points.length - 2].x
        );

        // Create a helper to rotate the arrow
        function transformPoint(point: PIXI.IPointData): [number, number] {
            // Translate the point
            const translatedX = point.x + arrowCenter.x;
            const translatedY = point.y + arrowCenter.y;

            // Rotate the point around the arrowCenter
            const rotatedX =
                arrowCenter.x +
                (translatedX - arrowCenter.x) * Math.cos(angle) -
                (translatedY - arrowCenter.y) * Math.sin(angle);
            const rotatedY =
                arrowCenter.y +
                (translatedX - arrowCenter.x) * Math.sin(angle) +
                (translatedY - arrowCenter.y) * Math.cos(angle);

            return [rotatedX, rotatedY];
        }

        // Draw the arrow
        let symbolAlpha = 1;
        if (edgeStyle.isEdgeSelected && !edgeStyle.state.selected && !edgeStyle.state.hover) {
            symbolAlpha = 0.3;
        }

        edgeLineGfx.lineStyle({
            alpha: symbolAlpha,
            cap: PIXI.LINE_CAP.ROUND,
            color,
            width: 2,
        });
        edgeLineGfx.moveTo(...transformPoint({ x: 8, y: 0 }));
        edgeLineGfx.lineTo(...transformPoint({ x: 0, y: 8 }));
        edgeLineGfx.moveTo(...transformPoint({ x: 8, y: 0 }));
        edgeLineGfx.lineTo(...transformPoint({ x: 0, y: -8 }));

        // Draw strength circles
        if (edgeStyle.strength) {
            const circlePositions = getCirclesAlongCurve(
                [...curvePoints].reverse(),
                edgeStyle.strength?.dots,
                10 * LOCAL_MULTIPLIER,
                (EDGE_OFFSET + 5) * LOCAL_MULTIPLIER
            );
            for (const circle of circlePositions) {
                edgeLineGfx.beginFill(color, symbolAlpha, true);
                edgeLineGfx.drawCircle(circle.x, circle.y, 4);
                edgeLineGfx.endFill();
            }
        }
    }

    /**
     * Update styles of all edge graphics
     *
     * @param edgeStyle current edge style
     * @param textureCache texture cache instance
     */
    updateStyle(edgeStyle: PixiEdgeStyle, textureCache: TextureCache): void {
        if (edgeStyle.points) {
            return;
        }

        EdgeObject.updateEdgeStyle(this.edgeGfx, edgeStyle, textureCache);
        EdgeObject.updateEdgeSymbolsStyle(this.edgeGfx, this.edgeSymbolsGfx, edgeStyle, textureCache);
    }

    /**
     * Update visibility of edge graphics
     *
     * @param zoomStep current zoom step
     */
    updateVisibility(zoomState: ZoomState, hasPoints: boolean): void {
        EdgeObject.updateEdgeVisibility(this.edgeGfx, zoomState, this.state);
        EdgeObject.updateEdgeSymbolVisibility(this.edgeSymbolsGfx, zoomState, hasPoints);
    }
}
