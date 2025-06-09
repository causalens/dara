/* eslint-disable no-await-in-loop */

/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useContext } from 'react';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api';
import { handleAuthErrors } from '@/auth/auth';
import { RegistriesCtx, useRequestExtras } from '@/shared/context';
import { type Component, type ComponentInstance } from '@/types/core';

interface ComponentRegistryInterface {
    get: (instance: ComponentInstance) => Promise<Component>;
}

/**
 * The component registry pulls the full list of components from the backend and then returns a function that allows a
 * specific component to be requested using it's instance.
 */
function useComponentRegistry(maxRetries = 5): ComponentRegistryInterface {
    const { componentRegistry: components, refetchComponents } = useContext(RegistriesCtx);
    const extras = useRequestExtras();
    const get = useCallback(
        async (instance: ComponentInstance): Promise<Component> => {
            let component: Component | null = null;
            let registry = { ...components };
            let i = 0;
            while (i < maxRetries) {
                if (registry && registry[instance.name]) {
                    component = registry[instance.name]!;
                    break;
                }
                if (i === 0) {
                    const res = await request(
                        `/api/core/components?name=${instance.name}`,
                        { method: HTTP_METHOD.GET },
                        extras
                    );
                    await handleAuthErrors(res, true);
                    await validateResponse(res, 'Failed to fetch the config for this app');
                    registry = await res.json();
                } else {
                    // If component has not been found, it could be a nested py_component, so we refetch the registry
                    // to see if the component might have been added to the registry in the meantime
                    // But first wait for 0,5s before retrying, to give time for backend to update the registry
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    const { data } = await refetchComponents();
                    registry = data!;
                }
                i++;
            }

            if (!component) {
                throw new Error(`Attempted to load a component (${instance.name}) that is not in the registry`);
            }

            return component;
        },
        [components]
    );

    return { get };
}

export default useComponentRegistry;
