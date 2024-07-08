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
import { makeAbsolute, parseSVG } from 'svg-path-parser';

export const QUESTION_MARK =
    'M5.46163 12.2353C4.4028 12.2353 3.57927 13.0588 3.57927 14.1176C3.57927 15.1765 4.34986 16 5.46163 16C6.46751 16 7.34398 15.1765 7.34398 14.1176C7.34398 13.0588 6.46751 12.2353 5.46163 12.2353ZM7.40869 0H4.4028C2.10869 0 0.285156 1.82353 0.285156 4.11765C0.285156 4.88235 0.932215 5.52941 1.69692 5.52941C2.46163 5.52941 3.10869 4.88235 3.10869 4.11765C3.10869 3.41176 3.64398 2.82353 4.34986 2.82353H7.35575C8.11457 2.82353 8.75575 3.41176 8.75575 4.11765C8.75575 4.58824 8.52045 4.94706 8.10869 5.18235L4.75575 7.23529C4.28516 7.52941 4.04986 8 4.04986 8.47059V9.41176C4.04986 10.1765 4.69692 10.8235 5.46163 10.8235C6.22633 10.8235 6.87339 10.1765 6.87339 9.41176V9.29412L9.52633 7.64706C10.7616 6.88235 11.5263 5.52941 11.5263 4.11765C11.5793 1.82353 9.75575 0 7.40869 0Z';

/**
 * Draw a given SVG path using given SmoothGraphics object
 *
 * @param d SVG path `d` attribute
 * @param gfx graphics object
 */
export function drawPath(d: string, gfx: SmoothGraphics): void {
    const relativeCommands = parseSVG(d.trim());
    const absoluteCommands = makeAbsolute(relativeCommands);

    for (const command of absoluteCommands) {
        switch (command.code) {
            case 'M': {
                gfx.moveTo(command.x, command.y);
                break;
            }
            case 'H':
            case 'V':
            case 'L': {
                gfx.lineTo(command.x, command.y);
                break;
            }
            case 'Z': {
                gfx.closePath();
                break;
            }
            case 'C': {
                gfx.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
                break;
            }
            case 'Q': {
                gfx.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
                break;
            }
            default: {
                // eslint-disable-next-line no-console
                console.info('SVG Draw command not supported:', command.code, command);
                break;
            }
        }
    }
}
