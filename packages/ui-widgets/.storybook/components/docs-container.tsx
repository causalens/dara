import set from 'lodash/set';
import React, { ReactNode } from 'react';
import { DocsContainer as BaseContainer } from '@storybook/addon-docs';
import { useDarkMode } from 'storybook-dark-mode';
import { themes } from '@storybook/theming';

/**
 * This is a small wrapper to make the dark-mode addon also apply the styles to the Docs page.
 * Wraps the documentation page and applies the correct theme based on the addon setting.
 *
 * Taken from: https://github.com/hipstersmoothie/storybook-dark-mode/issues/127
 */
export const DocsContainer = ({ children, context }: { children: ReactNode; context: any }) => {
    const dark = useDarkMode();
    set(context, 'parameters.docs.theme', dark ? themes.dark : themes.light);
    return <BaseContainer context={context}>{children}</BaseContainer>;
};
