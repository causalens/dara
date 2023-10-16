import { useContext, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { CallbackInterface, useRecoilCallback } from 'recoil';
import { Subscription } from 'rxjs';
import { concatMap, takeWhile } from 'rxjs/operators';
import shortid from 'shortid';

import { useNotifications } from '@darajs/ui-notifications';
import { HTTP_METHOD, Status, validateResponse } from '@darajs/ui-utils';

import { fetchTaskResult } from '@/api';
import { request } from '@/api/http';
import { useSessionToken } from '@/auth/auth-context';
import { ImportersCtx, WebSocketCtx, useTaskContext } from '@/shared/context';
import { Action, ActionHandler } from '@/types';
import { ActionContext, ActionDef, ActionImpl, AnnotatedAction } from '@/types/core';
import { isActionImpl } from '@/types/utils';

import { resolveVariable } from '../interactivity/resolve-variable';
import { normalizeRequest } from './normalization';
import useActionRegistry from './use-action-registry';

/**
 * Invoke a server-side action.
 * This is used for annotated actions, sends a POST request to the server to start an action execution.
 *
 * @param input input value for the action
 * @param executionId unique id for the action execution; this should be used to subscribe to action messages **before** calling fetchAction
 * @param annotatedAction annotated action instance
 * @param actionCtx action context
 */
async function invokeAction(
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

    const resContent = await res.json();
    console.log({ resContent });

    // for tasks, wait for it to finish and fetch the result
    // this is only used to pick up errors in the task execution
    if ('task_id' in resContent) {
        const taskId = resContent.task_id;

        actionCtx.taskCtx.startTask(taskId);

        await actionCtx.wsClient.waitForTask(taskId);

        actionCtx.taskCtx.endTask(taskId);

        // We don't need the result as the MetaTask will send WS messages with actions as per usual
        // fetchTaskResult will pick up on errors and raise them
        await fetchTaskResult(taskId, actionCtx.sessionToken);
    }
}

/**
 * Global cache of action handlers by name. Used for perf so each action will only have to be
 * resolved once.
 */
const ACTION_HANDLER_BY_NAME: Record<string, ActionHandler> = {};

/**
 * Error thrown when an action is not handled by the app.
 */
class UnhandledActionError extends Error {
    actionImpl: ActionImpl;

    constructor(message: string, actionImpl: ActionImpl) {
        super(message);
        this.actionImpl = actionImpl;
    }
}

/**
 * Resolve an action implementation into an action handler function.
 *
 * @param actionImpl action implementation
 * @param getAction callback to get the action definition from the action implementation
 * @param importers importers available in the app
 */
async function resolveActionImpl(
    actionImpl: ActionImpl,
    getAction: (instance: ActionImpl) => ActionDef,
    importers: Record<string, () => Promise<any>>
): Promise<ActionHandler<ActionImpl>> {
    // cache action handler globally for performance, they are pure functions so it's safe to do so
    if (!ACTION_HANDLER_BY_NAME[actionImpl.name]) {
        // resolve action handler function by name
        let actionDef;

        try {
            actionDef = getAction(actionImpl);
        } catch {
            throw new UnhandledActionError(`Action definition for impl "${actionImpl.name}" not found`, actionImpl);
        }
        const moduleContent = await importers[actionDef.py_module]();

        ACTION_HANDLER_BY_NAME[actionImpl.name] = moduleContent[actionImpl.name];
    }

    return ACTION_HANDLER_BY_NAME[actionImpl.name];
}

/**
 * Execute a given action.
 *
 * @param input component input value
 * @param action action implementation or annotated action
 * @param actionCtx action execution context
 * @param getAction callback to get the action definition from the action implementation
 * @param importers available importers in the app
 */
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

        // handle async handlers
        if (result instanceof Promise) {
            await result;
        }
        return;
    }

    // otherwise call back to the server to execute the annotated action
    // subscribe to action messages before even calling the action to avoid races
    const executionId = shortid.generate();
    const observable = actionCtx.wsClient.actionMessages$(executionId);

    return new Promise((resolve, reject) => {
        let activeTasks = 0; // Counter to keep track of active tasks
        let streamCompleted = false; // Flag to check if the stream is completed

        const checkForCompletion = (): void => {
            if (streamCompleted && activeTasks === 0) {
                resolve();
            }
        };

        let sub: Subscription;

        const onError = (error: Error): void => {
            // eslint-disable-next-line no-console
            console.error('Error executing action:', error);
            sub.unsubscribe();
            reject(error);
        };

        sub = observable
            .pipe(
                concatMap(async (actionImpl) => {
                    if (actionImpl) {
                        const handler = await resolveActionImpl(actionImpl, getAction, importers);
                        return [handler, actionImpl] as const;
                    }

                    return null;
                }),
                takeWhile((res) => !!res) // stop when falsy is returned from concatMap
            )
            .subscribe({
                complete: () => {
                    activeTasks -= 1;
                    streamCompleted = true; // Set the flag when the stream is complete
                    checkForCompletion();
                },
                error: (error) => {
                    activeTasks -= 1;
                    onError(error); // Reject the promise if there's an error in the stream
                },
                next: async ([handler, actionImpl]) => {
                    activeTasks += 1;

                    const result = handler(actionCtx, actionImpl);
                    // If it's a promise, await it to ensure sequential execution
                    if (result instanceof Promise) {
                        await result;
                    }
                },
            });

        // now request the action to be executed
        invokeAction(input, executionId, action, actionCtx).catch(onError);
    });
}

const noop = (): Promise<void> => Promise.resolve();

interface UseActionOptions {
    /**
     * Callback to invoke when an unhandled action is encountered.
     * When not defined, an error notification will be shown instead.
     *
     * @param action action implementation
     */
    onUnhandledAction?: (action: ActionImpl, actionCtx: ActionContext) => void | Promise<void>;
}

/**
 * Consume an action def from the framework and return a callback function that can be used to trigger it
 * and a loading state boolean indicating whether an action is currently in progress
 *
 * @param action the action passed in
 * @param options optional extra options for the hook
 */
export default function useAction(
    action: Action,
    options?: UseActionOptions
): [(input?: any) => Promise<void>, boolean] {
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
    const actionCtx = useRef<Omit<ActionContext, keyof CallbackInterface | 'input'>>();
    actionCtx.current = {
        history,
        location,
        notificationCtx,
        sessionToken,
        taskCtx,
        wsClient,
    };

    const optionsRef = useRef(options);
    optionsRef.current = options;

    const callback = useRecoilCallback(
        (cbInterface) => async (input: any) => {
            setIsLoading(true);

            const actionsToExecute = Array.isArray(action) ? action : [action];

            // execute actions sequentially
            for (const actionToExecute of actionsToExecute) {
                // this is redefined for each action to have up-to-date snapshot
                /* eslint-disable sort-keys-fix/sort-keys-fix */
                const fullActionContext = {
                    ...actionCtx.current,
                    input,
                    // Recoil callback interface cannot be spread as it is a Proxy
                    gotoSnapshot: cbInterface.gotoSnapshot,
                    refresh: cbInterface.refresh,
                    reset: cbInterface.reset,
                    set: cbInterface.set,
                    snapshot: cbInterface.snapshot,
                    transact_UNSTABLE: cbInterface.transact_UNSTABLE,
                };
                /* eslint-enable sort-keys-fix/sort-keys-fix */

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await executeAction(input, actionToExecute, fullActionContext, getAction, importers);
                } catch (error) {
                    // Handle unhandled action errors separately
                    if (error instanceof UnhandledActionError) {
                        // there is a callback defined for it, call it
                        if (optionsRef.current?.onUnhandledAction) {
                            const result = optionsRef.current.onUnhandledAction(error.actionImpl, fullActionContext);
                            if (result instanceof Promise) {
                                // eslint-disable-next-line no-await-in-loop
                                await result;
                            }
                        } else {
                            actionCtx.current.notificationCtx.pushNotification({
                                key: '_actionError', // same key so action errors don't stack
                                message: `Action "${error.actionImpl.name}" not registered`,
                                status: Status.ERROR,
                                title: 'Error executing action',
                            });
                        }
                        continue;
                    }

                    actionCtx.current.notificationCtx.pushNotification({
                        key: '_actionError', // same key so action errors don't stack
                        message: 'Try again or contact the application owner',
                        status: Status.ERROR,
                        title: 'Error executing action',
                    });
                }
            }

            setIsLoading(false);
        },
        [action, getAction, importers]
    );

    // return a noop if no action is passed
    if (!action) {
        return [noop, false];
    }

    return [callback, isLoading];
}
