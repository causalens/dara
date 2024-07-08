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

/**
 * File is needed to properly define the types for the default theme and give you type checking for accessing the theme
 *
 * https://styled-components.com/docs/api#typescript
 */
import 'styled-components';

// and extend them!
declare module 'styled-components' {
    export interface DefaultTheme {
        colors: {
            primary: string;
            primaryHover: string;
            primaryDown: string;

            background: string;
            text: string;

            grey1: string;
            grey2: string;
            grey3: string;
            grey4: string;
            grey5: string;
            grey6: string;

            blue1: string;
            blue2: string;
            blue3: string;
            blue4: string;

            violet: string;
            turquoise: string;
            purple: string;
            teal: string;
            orange: string;
            plum: string;

            error: string;
            errorHover: string;
            errorDown: string;

            secondary: string;
            secondaryHover: string;
            secondaryDown: string;

            success: string;
            successHover: string;
            successDown: string;

            warning: string;
            warningHover: string;
            warningDown: string;

            modalBg: string;
            shadowLight: string;
            shadowMedium: string;
        };
        font: {
            size: string;
        };
        shadow: {
            light: string;
            medium: string;
        };
        themeType: string;
    }
}
