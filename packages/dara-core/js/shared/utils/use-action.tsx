import { useCallback, useContext, useState } from 'react';
import { useLocation } from 'react-router';
import { useRecoilCallback } from 'recoil';
import { Observable } from 'rxjs';
import { concatMap, finalize, takeWhile } from 'rxjs/operators';
import shortid from 'shortid';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { useSessionToken } from '@/auth/auth-context';
import { ImportersCtx, WebSocketCtx, useTaskContext } from '@/shared/context';
import { Action, ActionHandler } from '@/types';
import { ActionImpl } from '@/types/core';

import { resolveVariable } from '../interactivity/resolve-variable';
import { normalizeRequest } from './normalization';
import useActionRegistry from './use-action-registry';

// Disabling rules of hook since the followiing function are willingly breaking the rules, making the assumption that the components call
// the exported functions with values which don't change the hook order etc

// /**
//  * Helper method which converts an action into a list of hooks.
//  *
//  * @param action action(s) to import
//  * @param getAction method to convert an action instance into its definition
//  * @param importers importers available in the app
//  */
// async function getActionHooks(
//     action: Action,
//     getAction: (instance: ActionInstance) => ActionDef,
//     importers: Record<string, () => Promise<any>>
// ): Promise<ActionHook<any>[]> {
//     const hooks: ActionHook<any>[] = [];
//     const actions = Array.isArray(action) ? action : [action];

//     for (const act of actions) {
//         const actDef = getAction(act);

//         // Doing this sequentially to preserve order and not break rules of hooks
//         // eslint-disable-next-line no-await-in-loop
//         const moduleContent = await importers[actDef.py_module]();

//         const Hook = moduleContent[actDef.name];

//         hooks.push(Hook);
//     }

//     return hooks;
// }

// /**
//  * Consume an action def from the framework and return a callback function that can be used to trigger it
//  * and a loading state boolean indicating whether an action is currently in progress
//  *
//  * @param actionDefinition the action def passed in
//  */
// export default function useAction(action: Action): [(value: any) => Promise<void>, boolean] {
//     // Sanity check - it's technically possible to pass an ActionInstance or empty array and pydantic accepts them and converts to an ActionInstance
//     if ((action as any)?.name === 'ActionInstance') {
//         throw new Error('Expected a registered sub-class of "ActionInstance", base class detected');
//     }

//     // No action passed - noop
//     if (!action || (Array.isArray(action) && action.length === 0)) {
//         return [() => Promise.resolve(), false];
//     }

//     const [loading, setLoading] = useState(false);

//     const importers = useContext(ImportersCtx);
//     const actionContext = useActionContext();
//     const { get: getAction } = useActionRegistry();
//     const [actionHooksReader] = useAsyncResource(getActionHooks, action, getAction, importers);

//     // Call all action hooks and collect the callbacks
//     const actionHooks = actionHooksReader();
//     const actionCallbacks: ReturnType<ActionHook<any>>[] = [];
//     const actions = Array.isArray(action) ? action : [action];
//     for (const [index, actionHook] of actionHooks.entries()) {
//         actionCallbacks.push(actionHook(actions[index], actionContext));
//     }

//     const actionCallback = useCallback(
//         async (value: any): Promise<void> => {
//             // Track loading state for all actions
//             setLoading(true);
//             try {
//                 for (const actionCb of actionCallbacks) {
//                     // Sequentially execute actions to ensure deterministic order of execution
//                     // eslint-disable-next-line no-await-in-loop
//                     await actionCb(value);
//                 }
//             } finally {
//                 // make sure to clean up loading state regardless of errors
//                 setLoading(false);
//             }
//         },
//         [action, ...actionCallbacks]
//     );

//     return [actionCallback, loading];
// }

const ACTION_HANDLER_BY_NAME: Record<string, ActionHandler> = {};

export default function useAction(action: Action): [(input: any) => Promise<void>, boolean] {
    const { client: wsClient } = useContext(WebSocketCtx);
    const importers = useContext(ImportersCtx);
    const { get: getAction } = useActionRegistry();
    const sessionToken = useSessionToken();
    const taskContext = useTaskContext();
    const { search } = useLocation();
    const [isLoading, setIsLoading] = useState(false);

    const fetchAction = useCallback(
        async (input: any, resolvedKwargs: Record<string, any>, executionId: string): Promise<void> => {
            const ws_channel = await wsClient.getChannel();
            const res = await request(
                `/api/core/action/${action.definition_uid}`,
                {
                    body: JSON.stringify({
                        execution_id: executionId,
                        input,
                        uid: action.uid,
                        values: normalizeRequest(resolvedKwargs, action.dynamic_kwargs),
                        ws_channel,
                    }),
                    method: HTTP_METHOD.POST,
                },
                sessionToken
            );

            await validateResponse(res, `Failed to fetch the action value with uid: ${action.uid}`);
        },
        [sessionToken, wsClient, action]
    );

    const callback = useRecoilCallback(
        (cbInterface) => async (input: any) => {
            setIsLoading(true);
            // 0. resolve kwargs to primitives, this registers variables if not already registered
            const resolvedKwargs = Object.keys(action.dynamic_kwargs).reduce((acc, k) => {
                const value = action.dynamic_kwargs[k];
                acc[k] = resolveVariable(value, wsClient, taskContext, search, sessionToken, (v) =>
                    // This is only called for primitive variables so it should always resolve successfully
                    // hence not using a promise
                    cbInterface.snapshot.getLoadable(v).getValue()
                );
                return acc;
            }, {} as Record<string, any>);

            // 1. send args to fetchAction, get uid back
            const executionId = shortid.generate();
            console.log(' waiting for execution', executionId);

            // 2. subscribe to action messages for given execution id
            const observable = wsClient.actionMessages$(executionId);

            const sub = observable
                .pipe(
                    concatMap(async (actionImpl) => {
                        console.log('actionImpl', actionImpl);

                        if (actionImpl) {
                            // cache action handler globally for performance, they are pure functions so it's safe to do so
                            if (!ACTION_HANDLER_BY_NAME[actionImpl.name]) {
                                // 3. resolve action handler function by name
                                const actionDef = getAction(actionImpl);
                                const moduleContent = await importers[actionDef.py_module]();
                                ACTION_HANDLER_BY_NAME[actionImpl.name] = moduleContent[actionImpl.name];
                            }

                            // Run the action handler
                            const handler = ACTION_HANDLER_BY_NAME[actionImpl.name];

                            return [handler, actionImpl] as const;
                        }

                        return null;
                    }),
                    takeWhile((res) => !!res), // stop when falsy is returned from concatMap
                    finalize(() => setIsLoading(false))
                )
                .subscribe(async ([handler, actionImpl]) => {
                    // TODO: handle error being sent as actionimpl? show toast
                    console.log('calling handler', actionImpl);
                    await handler({ sessionToken, wsClient, ...cbInterface }, actionImpl);
                });

            // now request the action to be executed
            try {
                await fetchAction(input, resolvedKwargs, executionId);
            } catch (e) {
                // TODO: show toast
                sub.unsubscribe();
            }
        },
        [fetchAction, action, search, taskContext]
    );

    return [callback, isLoading];
}
