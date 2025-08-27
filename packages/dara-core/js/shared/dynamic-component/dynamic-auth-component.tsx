import { type ComponentType, type ReactNode, useContext, useEffect, useRef, useState } from 'react';

import DefaultFallback from '@/components/fallback/default';
import ImportersCtx from '@/shared/context/importers-context';
import type { AuthComponent } from '@/types/core';

/**
 * Simplified version of DynamicComponent, just for the auth components.
 * This is because we can't use the component registry for auth components, since the component registry operates
 * in an authenticated context, and we need to be able to render the login page without being authenticated.
 */
function DynamicAuthComponent(props: { component: AuthComponent }): JSX.Element {
    const importers = useContext(ImportersCtx);
    const [component, setComponent] = useState(() => <DefaultFallback />);

    useEffect(() => {
        const importer = importers[props.component.py_module];

        if (!importer) {
            throw new Error(`Missing importer for module ${props.component.py_module}`);
        }

        importer()
            .then((moduleContent) => {
                if (!moduleContent) {
                    throw new Error(`Failed to import module ${props.component.py_module}`);
                }

                const Component = moduleContent[props.component.js_name] as ComponentType<any> | null;

                if (!Component) {
                    throw new Error(
                        `Failed to import component ${props.component.js_name} from module ${props.component.py_module}`
                    );
                }

                setComponent(<Component />);
            })
            .catch((err) => {
                throw new Error(`Failed to import module ${props.component.py_module}`, err);
            });
    }, [props.component, importers]);

    return component;
}

export default DynamicAuthComponent;
