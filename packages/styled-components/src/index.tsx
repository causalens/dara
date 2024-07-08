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
import styled, {
    DefaultTheme,
    ThemeContext,
    ThemeProvider,
    ThemedStyledInterface,
    createGlobalStyle,
    css,
    keyframes,
    useTheme,
} from 'styled-components';

interface Theme extends DefaultTheme {
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
    themeType: 'light' | 'dark';
}

/**
 * The default theme for the UI, all component colors should be pulled from here using styled components.
 */
const theme: Theme = {
    colors: {
        primary: '#3796F6',
        primaryHover: '#0079D4',
        primaryDown: '#0060AA',

        secondary: '#434B87',
        secondaryHover: '#4E568E',
        secondaryDown: '#5A629C',

        background: '#F8F9FF',
        text: '#1E244D',

        grey1: '#EEF1FA',
        grey2: '#DFE2EB',
        grey3: '#C3C6CF',
        grey4: '#8D9199',
        grey5: '#5B5E66',
        grey6: '#43474E',

        blue1: '#FBFCFF',
        blue2: '#ECF2FD',
        blue3: '#E1EEFD',
        blue4: '#C4DFFC',

        violet: '#5E62E2',
        turquoise: '#2CB85C',
        purple: '#E28FFF',
        teal: '#0790AE',
        orange: '#FF8F80',
        plum: '#BA3C8B',

        error: '#DA6087',
        errorHover: '#D14975',
        errorDown: '#C33462',

        success: '#2DB3BF',
        successHover: '#1CA6B2',
        successDown: '#149AA7',

        warning: '#DCB016',
        warningHover: '#D0A406',
        warningDown: '#C39800',

        modalBg: 'rgba(19, 25, 35, 0.5)',
        shadowLight: 'rgba(0, 0, 0, 0.1)',
        shadowMedium: 'rgba(0, 0, 0, 0.1)',
    },
    font: {
        size: '16px',
    },
    shadow: {
        light: '0px 2px 4px rgba(0, 0, 0, 0.1)',
        medium: '0px 2px 10px rgba(0, 0, 0, 0.1)',
    },
    themeType: 'light',
};

const darkTheme: Theme = {
    colors: {
        primary: '#2485E8',
        primaryHover: '#4799EB',
        primaryDown: '#5EA3E9',

        secondary: '#BEC5EE',
        secondaryHover: '#CAD0F4',
        secondaryDown: '#D3D8F4',

        background: '#111314',
        text: '#EDEEFA',

        grey1: '#32373D',
        grey2: '#43474E',
        grey3: '#5B5E66',
        grey4: '#8D9199',
        grey5: '#C3C6CF',
        grey6: '#DFE2EB',

        blue1: '#252A31',
        blue2: '#25323F',
        blue3: '#203750',
        blue4: '#204368',

        violet: '#5E31DC',
        turquoise: '#109C41',
        purple: '#D96FFF',
        teal: '#00849F',
        orange: '#DB6D5E',
        plum: '#AB2178',

        error: '#CA456F',
        errorHover: '#D1567E',
        errorDown: '#D7688B',

        success: '#1A9FAC',
        successHover: '#27A9B6',
        successDown: '#34B4C0',

        warning: '#C8981F',
        warningHover: '#D7A526',
        warningDown: '#E2B235',

        modalBg: 'rgba(19, 25, 35, 0.5)',
        shadowLight: 'rgba(0, 0, 0, 0.1)',
        shadowMedium: 'rgba(0, 0, 0, 0.1)',
    },
    font: {
        size: '16px',
    },
    shadow: {
        light: '0px 2px 4px rgba(0, 0, 0, 0.1)',
        medium: '0px 2px 10px rgba(0, 0, 0, 0.1)',
    },
    themeType: 'dark',
};

function useClTheme(): Theme {
    return useTheme() as Theme;
}

export {
    darkTheme,
    Theme as DefaultTheme,
    keyframes,
    css,
    ThemeContext,
    ThemeProvider,
    theme,
    useClTheme as useTheme,
    createGlobalStyle,
};
export default styled as ThemedStyledInterface<Theme>;
