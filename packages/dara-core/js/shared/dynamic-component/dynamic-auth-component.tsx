import { type ComponentType, type ReactNode } from 'react';

import type { AuthComponent, ModuleContent } from '@/types/core';

const PRELOADED_COMPONENTS: Record<string, ReactNode> = {};

function getIdentifier(component: AuthComponent): string {
    return `${component.py_module}.${component.js_name}`;
}

export async function preloadAuthComponent(
    importers: Record<string, () => Promise<ModuleContent>>,
    component: AuthComponent
): Promise<void> {
    const importer = importers[component.py_module];

    if (!importer) {
        throw new Error(`Missing importer for module ${component.py_module}`);
    }

    let moduleContent: any = null;

    try {
        moduleContent = await importer();
    } catch (err) {
        throw new Error(`Failed to import module ${component.py_module}`, err as Error);
    }
    if (!moduleContent) {
        throw new Error(`Failed to import module ${component.py_module}`);
    }

    const Component = moduleContent[component.js_name] as ComponentType<any> | null;

    if (!Component) {
        throw new Error(`Failed to import component ${component.js_name} from module ${component.py_module}`);
    }

    PRELOADED_COMPONENTS[getIdentifier(component)] = <Component />;
}

/**
 * Simplified version of DynamicComponent, just for the auth components.
 * This is because we can't use the component registry for auth components, since the component registry operates
 * in an authenticated context, and we need to be able to render the login page without being authenticated.
 */
function DynamicAuthComponent(props: { component: AuthComponent }): React.ReactNode {
    const identifier = getIdentifier(props.component);
    // should not happen
    if (!(identifier in PRELOADED_COMPONENTS)) {
        throw new Error(`Component ${identifier} not found`);
    }
    return PRELOADED_COMPONENTS[identifier]!;
}

export default DynamicAuthComponent;
