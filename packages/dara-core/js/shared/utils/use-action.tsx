import { useCallback, useContext, useState } from 'react';
import { useAsyncResource } from 'use-async-resource';

import { useActionContext } from '@/actions/utils';
import { ImportersCtx } from '@/shared/context';
import { Action, ActionDef, ActionHook, ActionInstance } from '@/types';

import useActionRegistry from './use-action-registry';

// Disabling rules of hook since the followiing function are willingly breaking the rules, making the assumption that the components call
// the exported functions with values which don't change the hook order etc
/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */

/**
 * Helper method which converts an action into a list of hooks.
 *
 * @param action action(s) to import
 * @param getAction method to convert an action instance into its definition
 * @param importers importers available in the app
 */
async function getActionHooks(
    action: Action,
    getAction: (instance: ActionInstance) => ActionDef,
    importers: Record<string, () => Promise<any>>
): Promise<ActionHook<any>[]> {
    const hooks: ActionHook<any>[] = [];
    const actions = Array.isArray(action) ? action : [action];

    for (const act of actions) {
        const actDef = getAction(act);

        // Doing this sequentially to preserve order and not break rules of hooks
        // eslint-disable-next-line no-await-in-loop
        const moduleContent = await importers[actDef.py_module]();

        const Hook = moduleContent[actDef.name];

        hooks.push(Hook);
    }

    return hooks;
}

/**
 * Consume an action def from the framework and return a callback function that can be used to trigger it
 * and a loading state boolean indicating whether an action is currently in progress
 *
 * @param actionDefinition the action def passed in
 */
export default function useAction(action: Action): [(value: any) => Promise<void>, boolean] {
    // Sanity check - it's technically possible to pass an ActionInstance or empty array and pydantic accepts them and converts to an ActionInstance
    if ((action as any)?.name === 'ActionInstance') {
        throw new Error('Expected a registered sub-class of "ActionInstance", base class detected');
    }

    // No action passed - noop
    if (!action || (Array.isArray(action) && action.length === 0)) {
        return [() => Promise.resolve(), false];
    }

    const [loading, setLoading] = useState(false);

    const importers = useContext(ImportersCtx);
    const actionContext = useActionContext();
    const { get: getAction } = useActionRegistry();
    const [actionHooksReader] = useAsyncResource(getActionHooks, action, getAction, importers);

    // Call all action hooks and collect the callbacks
    const actionHooks = actionHooksReader();
    const actionCallbacks: ReturnType<ActionHook<any>>[] = [];
    const actions = Array.isArray(action) ? action : [action];
    for (const [index, actionHook] of actionHooks.entries()) {
        actionCallbacks.push(actionHook(actions[index], actionContext));
    }

    const actionCallback = useCallback(
        async (value: any): Promise<void> => {
            // Track loading state for all actions
            setLoading(true);
            try {
                for (const actionCb of actionCallbacks) {
                    // Sequentially execute actions to ensure deterministic order of execution
                    // eslint-disable-next-line no-await-in-loop
                    await actionCb(value);
                }
            } finally {
                // make sure to clean up loading state regardless of errors
                setLoading(false);
            }
        },
        [action, ...actionCallbacks]
    );

    return [actionCallback, loading];
}
