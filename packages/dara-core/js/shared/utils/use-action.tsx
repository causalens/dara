import { useCallback, useContext, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { CallbackInterface, useRecoilCallback } from 'recoil';
import { Observable } from 'rxjs';
import { concatMap, finalize, takeWhile } from 'rxjs/operators';
import shortid from 'shortid';

import { useNotifications } from '@darajs/ui-notifications';
import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { useSessionToken } from '@/auth/auth-context';
import { ImportersCtx, WebSocketCtx, useTaskContext } from '@/shared/context';
import { Action, ActionHandler } from '@/types';
import { ActionContext, ActionDef, ActionImpl, AnnotatedAction } from '@/types/core';
import { isActionImpl } from '@/types/utils';

import { resolveVariable } from '../interactivity/resolve-variable';
import { normalizeRequest } from './normalization';
import useActionRegistry from './use-action-registry';

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

/**
 *
 * @param input input value for the action
 * @param executionId unique id for the action execution; this should be used to subscribe to action messages **before** calling fetchAction
 * @param annotatedAction annotated action instance
 * @param actionCtx action context
 */
async function fetchAction(
    input: any,
    executionId: string,
    annotatedAction: AnnotatedAction,
    actionCtx: ActionContext
): Promise<void> {
    // resolve kwargs to primitives, this registers variables if not already registered
    const resolvedKwargs = Object.keys(annotatedAction.dynamic_kwargs).reduce((acc, k) => {
        const value = annotatedAction.dynamic_kwargs[k];
        acc[k] = resolveVariable(
            value,
            actionCtx.wsClient,
            actionCtx.taskCtx,
            actionCtx.location.search,
            actionCtx.sessionToken,
            (v) =>
                // This is only called for primitive variables so it should always resolve successfully
                // hence not using a promise
                actionCtx.snapshot.getLoadable(v).getValue()
        );
        return acc;
    }, {} as Record<string, any>);

    const ws_channel = await actionCtx.wsClient.getChannel();

    const res = await request(
        `/api/core/action/${annotatedAction.definition_uid}`,
        {
            body: JSON.stringify({
                execution_id: executionId,
                input,
                uid: annotatedAction.uid,
                values: normalizeRequest(resolvedKwargs, annotatedAction.dynamic_kwargs),
                ws_channel,
            }),
            method: HTTP_METHOD.POST,
        },
        actionCtx.sessionToken
    );

    await validateResponse(res, `Failed to fetch the action value with uid: ${annotatedAction.uid}`);
}

const ACTION_HANDLER_BY_NAME: Record<string, ActionHandler> = {};

async function resolveActionImpl(
    actionImpl: ActionImpl,
    getAction: (instance: ActionImpl) => ActionDef,
    importers: Record<string, () => Promise<any>>
) {
    // cache action handler globally for performance, they are pure functions so it's safe to do so
    if (!ACTION_HANDLER_BY_NAME[actionImpl.name]) {
        // 3. resolve action handler function by name
        const actionDef = getAction(actionImpl);
        const moduleContent = await importers[actionDef.py_module]();
        ACTION_HANDLER_BY_NAME[actionImpl.name] = moduleContent[actionImpl.name];
    }

    return ACTION_HANDLER_BY_NAME[actionImpl.name];
}

async function executeAction(
    input: any,
    action: ActionImpl | AnnotatedAction,
    actionCtx: ActionContext,
    getAction: (instance: ActionImpl) => ActionDef,
    importers: Record<string, () => Promise<any>>
): Promise<void> {
    // if it's a simple action implementation, run the handler directly
    if (isActionImpl(action)) {
        const handler = await resolveActionImpl(action, getAction, importers);
        const result = handler(actionCtx, action);

        if (result instanceof Promise) {
            await result;
        }
        return;
    }

    // otherwise call back to the server to execute the annotated action
    const executionId = shortid.generate();

    const observable = actionCtx.wsClient.actionMessages$(executionId);

    return new Promise((resolve) => {
        const sub = observable
            .pipe(
                concatMap(async (actionImpl) => {
                    console.log('actionImpl', actionImpl);

                    if (actionImpl) {
                        const handler = await resolveActionImpl(actionImpl, getAction, importers);
                        return [handler, actionImpl] as const;
                    }

                    return null;
                }),
                takeWhile((res) => !!res), // stop when falsy is returned from concatMap
                finalize(() => resolve())
            )
            .subscribe(async ([handler, actionImpl]) => {
                // TODO: handle error? show toast
                console.log('calling handler', actionImpl);
                const result = handler(actionCtx, actionImpl);
                // If it's a promise, await it to ensure sequential execution
                if (result instanceof Promise) {
                    await result;
                }
            });

        // now request the action to be executed
        fetchAction(input, executionId, action, actionCtx).catch(() => sub.unsubscribe());
    });
}

export default function useAction(action: Action): [(input?: any) => Promise<void>, boolean] {
    const { client: wsClient } = useContext(WebSocketCtx);
    const importers = useContext(ImportersCtx);
    const { get: getAction } = useActionRegistry();
    const notificationCtx = useNotifications();
    const sessionToken = useSessionToken();
    const history = useHistory();
    const taskCtx = useTaskContext();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(false);

    // keep actionCtx in a ref to avoid re-creating the callbacks
    const actionCtx = useRef<Omit<ActionContext, keyof CallbackInterface>>();
    actionCtx.current = {
        history,
        location,
        notificationCtx,
        sessionToken,
        taskCtx,
        wsClient,
    };

    const callback = useRecoilCallback(
        (cbInterface) => async (input: any) => {
            setIsLoading(true);

            const actionsToExecute = Array.isArray(action) ? action : [action];

            // execute actions sequentially
            for (const actionToExecute of actionsToExecute) {
                // eslint-disable-next-line no-await-in-loop
                await executeAction(
                    input,
                    actionToExecute,
                    { ...actionCtx.current, ...cbInterface },
                    getAction,
                    importers
                );
            }

            setIsLoading(false);
        },
        [action, getAction, importers]
    );

    // return a noop if no action is passed
    if (!action) {
        return [() => Promise.resolve(), false];
    }

    return [callback, isLoading];
}
