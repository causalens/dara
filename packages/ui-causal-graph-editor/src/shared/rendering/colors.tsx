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

interface Shadows {
    shadowHover: string;
    shadowNormal: string;
}

/**
 * Shadow colors for the graph UI
 */
export const SHADOWS: Record<DefaultTheme['themeType'], Shadows> = {
    dark: {
        shadowHover: 'rgba(255, 255, 255, 0.3)',
        shadowNormal: 'rgba(0, 0, 0, 0.6)',
    },
    light: {
        shadowHover: 'rgba(0, 0, 0, 0.5)',
        shadowNormal: 'rgba(0, 0, 0, 0.25)',
    },
};
