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

import { ZoomState, ZoomThresholds } from '@types';

import { GraphLayout, GraphLayoutWithGrouping, GraphLayoutWithTiers } from '../graph-layout/common';

export const MOUSE_EVENTS = ['mousemove', 'mouseover', 'mouseout', 'mousedown', 'mouseup'] as const;

const colorCache = new Map<string, [number, number]>();

/**
 * Parse a given CSS color definition to a format understood by PIXI.
 *
 * Memoized for performance
 *
 * @param color string color definition
 */
export function colorToPixi(color: string): [hex: number, alpha: number] {
    if (colorCache.has(color)) {
        return colorCache.get(color);
    }

    const pixiColor = new PIXI.Color(color);
    const result = [pixiColor.toNumber(), pixiColor.alpha] as [number, number];
    colorCache.set(color, result);
    return result;
}

const DELIMITER = '::';

/**
 * Create a unique key based on given set of params
 *
 * @param params parameters to use
 */
export function createKey(...params: Array<string | number | boolean>): string {
    return params.join(DELIMITER);
}

const DEFAULT_ZOOM_THRESHOLDS: ZoomThresholds = {
    edge: 0.08,
    label: 0.3,
    shadow: 0.6,
    symbol: 0.2,
};

/**
 * Get current zoom state based on current scale
 *
 * @param scale current zoom scale
 * @param zoomThresholds custom zoom thresholds to use, if not provided, default thresholds are used
 */
export function getZoomState(scale: number, zoomThresholds?: ZoomThresholds): ZoomState {
    return Object.entries(zoomThresholds ?? DEFAULT_ZOOM_THRESHOLDS).reduce(
        (acc, [key, value]) => ({
            ...acc,
            [key]: scale > value,
        }),
        {} as ZoomState
    );
}

export function isGraphLayoutWithTiers(layout: GraphLayout): layout is GraphLayoutWithTiers {
    return (layout as GraphLayoutWithTiers).tiers !== undefined;
}

export function isGraphLayoutWithGroups(layout: GraphLayout): layout is GraphLayoutWithGrouping {
    return (layout as GraphLayoutWithGrouping).group !== undefined;
}
