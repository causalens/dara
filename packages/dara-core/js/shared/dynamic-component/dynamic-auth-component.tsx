import { type ComponentType, type ReactNode } from 'react';

import type { AuthComponent } from '../../types/core';

const PRELOADED_COMPONENTS: Record<string, ReactNode> = {};

/** Populate the unauthenticated registry keyed by each screen's module specifier. */
export function registerAuthComponents(components: Record<string, ComponentType>): void {
    for (const key of Object.keys(PRELOADED_COMPONENTS)) {
        delete PRELOADED_COMPONENTS[key];
    }
    for (const [key, Component] of Object.entries(components)) {
        PRELOADED_COMPONENTS[key] = <Component />;
    }
}

/**
 * Simplified version of DynamicComponent, just for the auth components.
 * This is because we can't use the component registry for auth components, since the component registry operates
 * in an authenticated context, and we need to be able to render the login page without being authenticated.
 */
function DynamicAuthComponent(props: { component: AuthComponent }): React.ReactNode {
    const identifier = props.component.js_source;
    // should not happen
    if (!(identifier in PRELOADED_COMPONENTS)) {
        throw new Error(`Component ${identifier} not found`);
    }
    return PRELOADED_COMPONENTS[identifier]!;
}

export default DynamicAuthComponent;
