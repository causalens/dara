import isNull from 'lodash/isNull';
import omitBy from 'lodash/omitBy';

import { type DefaultTheme, darkTheme, theme } from '@darajs/styled-components';

function isTheme(configTheme: string | DefaultTheme): configTheme is DefaultTheme {
    return typeof configTheme !== 'string';
}

/**
 * Resolve the theme passed from the backend. If the default values of 'default' or 'dark' are passed then return the
 * default themes from styled-components, otherwise pass back the custom theme scheme.
 *
 * @param configTheme - the config theme structure of the app
 */
export default function resolveTheme(
    configTheme: 'light' | 'dark' | DefaultTheme | undefined,
    baseTheme?: 'light' | 'dark'
): DefaultTheme {
    if (!configTheme || configTheme === 'light') {
        return theme;
    }

    if (configTheme === 'dark') {
        return darkTheme;
    }

    if (isTheme(configTheme)) {
        const original: DefaultTheme = baseTheme === 'dark' ? darkTheme : theme;

        return {
            // Here we spread both first to pick up anything missing from the default theme and anything new/extra in
            // the new theme.
            ...original,
            ...omitBy(configTheme, isNull),
            colors: {
                ...original.colors,
                ...omitBy(configTheme.colors, isNull),
            },
            font: {
                ...original.font,
                ...omitBy(configTheme.font, isNull),
            },
            shadow: {
                ...original.shadow,
                ...omitBy(configTheme.shadow, isNull),
            },
        };
    }
    // eslint-disable-next-line no-console
    console.warn('No valid theme was found. Defaulting to light theme.');
    return theme;
}
