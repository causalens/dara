import { useCallback, useContext } from 'react';

import RegistriesCtx from '@/shared/context/registries-context';
import { ActionDef, ActionImpl } from '@/types/core';

interface ActionRegistryInterface {
    get: (instance: ActionImpl) => ActionDef;
}

/**
 * The action registry pulls the full list of actions from the backend and then returns a function that allows a
 * specific action to be requested using it's instance.
 */
function useActionRegistry(): ActionRegistryInterface {
    const { actionRegistry: actions } = useContext(RegistriesCtx);

    const get = useCallback(
        (impl: ActionImpl): ActionDef => {
            if (actions && actions[impl.name]) {
                return actions[impl.name];
            }
            throw new Error(`Attempted to load an action (${impl.name}) that is not in the registry`);
        },
        [actions]
    );

    return { get };
}

export default useActionRegistry;
