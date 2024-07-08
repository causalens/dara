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
import { DefaultTheme } from '@darajs/styled-components';

import { TARGET_NODE_MULTIPLIER } from '@shared/utils';

import { PixiNodeStyle } from './definitions';

/**
 * Get node color based on its category
 *
 * @param category node category
 * @param theme current theme colors
 */
export function getNodeColor(category: PixiNodeStyle['category'], theme: DefaultTheme): [bg: string, font: string] {
    switch (category) {
        case 'target':
            return [theme.colors.secondary, theme.colors.blue1];
        case 'latent':
            return [theme.colors.blue1, theme.colors.text];
        default:
            return [theme.colors.blue4, theme.colors.text];
    }
}

/**
 * Get node size based on configured size and category
 *
 * @param size configured node size
 * @param group group node is in
 */
export function getNodeSize(size: number, category: PixiNodeStyle['category']): number {
    const sizeMultiplier = category === 'target' ? TARGET_NODE_MULTIPLIER : 1;

    return size * sizeMultiplier;
}
