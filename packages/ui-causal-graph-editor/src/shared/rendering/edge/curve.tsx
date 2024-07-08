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

interface SegmentData {
    c1: number;
    c2: number;
    c3: number;
    c4: number;
}

// cache segment data between calls
const globalSegmentCache = new Map<number, Map<number, SegmentData>>();

/**
 * Get points on a curve to draw a smooth curve.
 *
 * Utilise Cubic Hermite cardinal splines. Adapted from https://stackoverflow.com/a/15528789
 *
 * @param points points the curve should go through
 * @param tension tension of the curve
 * @param numOfSegments number of segments to use per point
 */
export function getCurvePoints(points: PIXI.IPointData[], tension = 0.5, numOfSegments = 16): PIXI.IPointData[] {
    let _pts: PIXI.IPointData[] = [];
    const res: PIXI.IPointData[] = [];

    // cache data which doesn't change between points
    let segmentCache = globalSegmentCache.get(numOfSegments);

    if (!segmentCache) {
        segmentCache = new Map<number, SegmentData>();

        for (let t = 0; t <= numOfSegments; t++) {
            const st = t / numOfSegments;

            const c1 = 2 * st ** 3 - 3 * st ** 2 + 1;
            const c2 = -(2 * st ** 3) + 3 * st ** 2;
            const c3 = st ** 3 - 2 * st ** 2 + st;
            const c4 = st ** 3 - st ** 2;

            segmentCache.set(t, { c1, c2, c3, c4 });
        }

        globalSegmentCache.set(numOfSegments, segmentCache);
    }

    _pts = points.slice(0);

    _pts.unshift(points[0]);
    _pts.push(points[points.length - 1]);

    for (let i = 1; i < _pts.length - 2; i += 1) {
        for (let t = 0; t <= numOfSegments; t++) {
            const t1x = (_pts[i + 1].x - _pts[i - 1].x) * tension;
            const t2x = (_pts[i + 2].x - _pts[i].x) * tension;

            const t1y = (_pts[i + 1].y - _pts[i - 1].y) * tension;
            const t2y = (_pts[i + 2].y - _pts[i].y) * tension;

            const { c1, c2, c3, c4 } = segmentCache.get(t);

            const x = c1 * _pts[i].x + c2 * _pts[i + 1].x + c3 * t1x + c4 * t2x;
            const y = c1 * _pts[i].y + c2 * _pts[i + 1].y + c3 * t1y + c4 * t2y;

            res.push({ x, y });
        }
    }

    return res;
}

/**
 * Get points on a polygon encapsulating the given curve from two sides, parallel to the curve.
 *
 * We do this by computing points offset from the curve by the given distance.
 * Each point is the middle of the line between two consecutive points on the curve,
 * and is offset by the given distance from the curve at the angle perpendicular to the curve.
 *
 * @param curve curve points
 * @param distance distance between the curve and the polygon
 */
export function getPolygonFromCurve(curve: PIXI.IPointData[], distance = 6): PIXI.IPointData[] {
    const sideAPoints: PIXI.IPointData[] = [];
    const sideBPoints: PIXI.IPointData[] = [];

    for (let i = 0; i < curve.length - 1; i++) {
        const a = curve[i];
        const b = curve[i + 1];

        // make sure we handle cases where the two consecutive points are the same
        if (a.x === b.x && a.y === b.y) {
            continue;
        }

        // get angle perpendicular to x->y
        const angle = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;

        const middleX = (a.x + b.x) / 2;
        const middleY = (a.y + b.y) / 2;

        // add to sideAPoints a point moved by distance in the direction of the perpendicular angle
        sideAPoints.push({
            x: middleX + Math.cos(angle) * distance,
            y: middleY + Math.sin(angle) * distance,
        });

        // add to sideBpoints a point moved by distance in the opposite direction of the perpendicular angle
        sideBPoints.unshift({
            x: middleX - Math.cos(angle) * distance,
            y: middleY - Math.sin(angle) * distance,
        });
    }

    return [...sideAPoints, ...sideBPoints];
}

/**
 * Compute positions of X circles along a curve.
 *
 * The first circle is offset by `offset`.
 * The circles are evenly spaced along the curve by `distanceBetweenCircles`
 *
 * @param curvePoints  points on the curve
 * @param numCircles number of circles to draw
 * @param distanceBetweenCircles distance between each circle
 * @param offset offset of the first circle
 */
export function getCirclesAlongCurve(
    curvePoints: PIXI.IPointData[],
    numCircles: number,
    distanceBetweenCircles: number,
    offset: number
): PIXI.IPointData[] {
    const circles: PIXI.IPointData[] = [];
    let currentSegmentIndex = 0;
    let currentDistance = -offset;

    // loop through each circle we want to draw
    for (let i = 0; i < numCircles; i++) {
        const targetDistance = i * distanceBetweenCircles;

        // find the segment the circle should be placed on
        while (currentSegmentIndex < curvePoints.length - 1) {
            const dx = curvePoints[currentSegmentIndex + 1].x - curvePoints[currentSegmentIndex].x;
            const dy = curvePoints[currentSegmentIndex + 1].y - curvePoints[currentSegmentIndex].y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (currentDistance + segmentLength > targetDistance) {
                const t = (targetDistance - currentDistance) / segmentLength;
                circles.push({
                    x: curvePoints[currentSegmentIndex].x + t * dx,
                    y: curvePoints[currentSegmentIndex].y + t * dy,
                });
                break;
            } else {
                currentDistance += segmentLength;
                currentSegmentIndex++;
            }
        }
    }

    return circles;
}
