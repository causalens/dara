import { useCallback, useContext } from 'react';

import RegistriesCtx from '@/shared/context/registries-context';
import { ActionDef, ActionInstance } from '@/types/core';

interface ActionRegistryInterface {
    get: (instance: ActionInstance) => ActionDef;
}

/**
 * The action registry pulls the full list of actions from the backend and then returns a function that allows a
 * specific action to be requested using it's instance.
 */
function useActionRegistry(): ActionRegistryInterface {
    const { actionRegistry: actions } = useContext(RegistriesCtx);

    const get = useCallback(
        (instance: ActionInstance): ActionDef => {
            if (actions && actions[instance.name]) {
                return actions[instance.name];
            }
            throw new Error(`Attempted to load an action (${instance.name}) that is not in the registry`);
        },
        [actions]
    );

    return { get };
}

export default useActionRegistry;
