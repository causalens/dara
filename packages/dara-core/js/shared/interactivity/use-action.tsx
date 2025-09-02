import groupBy from 'lodash/groupBy';
import { nanoid } from 'nanoid';
import { useContext, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { type CallbackInterface, useRecoilCallback } from 'recoil';
import { Subscription } from 'rxjs';
import { concatMap, takeWhile } from 'rxjs/operators';

import { useNotifications } from '@darajs/ui-notifications';
import { HTTP_METHOD, Status, validateResponse } from '@darajs/ui-utils';

import { fetchTaskResult } from '@/api/core';
import { request } from '@/api/http';
import { handleAuthErrors } from '@/auth/auth';
import { WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    type Action,
    type ActionContext,
    type ActionDef,
    type ActionHandler,
    type ActionImpl,
    type AnnotatedAction,
    type ModuleContent,
} from '@/types/core';
import { isActionImpl, isVariable } from '@/types/utils';

import { useEventBus } from '../event-bus/event-bus';
import { normalizeRequest } from '../utils/normalization';
import { cleanKwargs, getOrRegisterPlainVariable, resolveVariable } from './internal';
import { useVariable } from './use-variable';

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
    const resolvedKwargs = await Promise.all(
        Object.entries(annotatedAction.dynamic_kwargs).map(async ([k, value]) => {
            const resolvedValue =
                isVariable(value) ?
                    await resolveVariable(value, actionCtx.wsClient, actionCtx.taskCtx, actionCtx.extras, (v) =>
                        actionCtx.snapshot.getLoadable(v).toPromise()
                    )
                :   value;
            return [k, resolvedValue];
        })
    ).then((entries) => Object.fromEntries(entries));

    const ws_channel = await actionCtx.wsClient.getChannel();

    const res = await request(
        `/api/core/action/${annotatedAction.definition_uid}`,
        {
            body: JSON.stringify({
                execution_id: executionId,
                input,
                uid: annotatedAction.uid,
                values: normalizeRequest(cleanKwargs(resolvedKwargs, null), annotatedAction.dynamic_kwargs),
                ws_channel,
            }),
            method: HTTP_METHOD.POST,
        },
        actionCtx.extras
    );

    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to fetch the action value with uid: ${annotatedAction.uid}`);

    const resContent = await res.json();

    // for tasks, wait for it to finish and fetch the result
    // this is only used to pick up errors in the task execution
    if ('task_id' in resContent) {
        const taskId = resContent.task_id;

        actionCtx.taskCtx.startTask(taskId);

        await actionCtx.wsClient.waitForTask(taskId);

        actionCtx.taskCtx.endTask(taskId);

        // We don't need the result as the MetaTask will send WS messages with actions as per usual
        // fetchTaskResult will pick up on errors and raise them
        await fetchTaskResult(taskId, actionCtx.extras);
    }
}

/**
 * Global cache of action handlers by name. Used for perf so each action will only have to be
 * resolved once.
 */
const ACTION_HANDLER_BY_NAME: Record<string, ActionHandler> = {};

/**
 * Pre-warm the action handlers in the action registry.
 */
export async function preloadActions(
    importers: Record<string, () => Promise<ModuleContent>>,
    actions: ActionDef[]
): Promise<void> {
    const componentsByModule = groupBy(actions, (actionDef) => actionDef.py_module);

    await Promise.all(
        Object.entries(componentsByModule).map(async ([module, moduleActions]) => {
            const moduleContent = await importers[module]!();
            for (const action of moduleActions) {
                if (ACTION_HANDLER_BY_NAME[action.name]) {
                    continue;
                }
                const actionHandler = moduleContent[action.name];
                if (actionHandler) {
                    ACTION_HANDLER_BY_NAME[action.name] = actionHandler as ActionHandler;
                }
            }
        })
    );
}

/**
 * Clear the global action handler cache.
 * This is only used for testing.
 */
export function clearActionHandlerCache_TEST(): void {
    Object.keys(ACTION_HANDLER_BY_NAME).forEach((k) => delete ACTION_HANDLER_BY_NAME[k]);
}

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
 * @param actionCtx action execution context
 */
function resolveActionImpl(actionImpl: ActionImpl, actionCtx: ActionContext): ActionHandler<ActionImpl> {
    let actionHandler: ActionHandler;

    // all action handlers would have been cached by preloadActions
    if (!ACTION_HANDLER_BY_NAME[actionImpl.name]) {
        // if we failed to resolve the action handler, use the catch-all handler if defined
        if (actionCtx.onUnhandledAction) {
            // this one is explicitly not cached since it's an arbitrary user-defined handler
            actionHandler = actionCtx.onUnhandledAction;
        } else {
            throw new UnhandledActionError(`Action definition for impl "${actionImpl.name}" not found`, actionImpl);
        }
    } else {
        actionHandler = ACTION_HANDLER_BY_NAME[actionImpl.name]!;
    }

    return actionHandler;
}

/**
 * Execute a given action.
 *
 * @param input component input value
 * @param action action implementation or annotated action
 * @param actionCtx action execution context
 */
async function executeAction(
    input: any,
    action: ActionImpl | AnnotatedAction,
    actionCtx: ActionContext
): Promise<void> {
    // if it's a simple action implementation, run the handler directly
    if (isActionImpl(action)) {
        const handler = resolveActionImpl(action, actionCtx);
        const result = handler(actionCtx, action);

        // handle async handlers
        if (result instanceof Promise) {
            await result;
        }

        return;
    }

    // otherwise call back to the server to execute the annotated action
    // subscribe to action messages before even calling the action to avoid races
    const executionId = nanoid();
    const observable = actionCtx.wsClient.actionMessages$(executionId);

    return new Promise((resolve, reject) => {
        let activeTasks = 0; // Counter to keep track of active tasks
        let streamCompleted = false; // Flag to check if the stream is completed
        let isSettled = false;

        let sub: Subscription;

        const checkForCompletion = (): void => {
            if (!isSettled && streamCompleted && activeTasks === 0) {
                isSettled = true;
                sub.unsubscribe();
                resolve();
            }
        };

        const onError = (error: Error): void => {
            if (!isSettled) {
                isSettled = true;
                sub.unsubscribe();
                reject(error);
            }
        };

        sub = observable
            .pipe(
                // eslint-disable-next-line @typescript-eslint/require-await
                concatMap(async (actionImpl) => {
                    if (actionImpl) {
                        const handler = resolveActionImpl(actionImpl, actionCtx);
                        return [handler, actionImpl] as const;
                    }

                    return null;
                }),
                takeWhile((res) => !!res) // stop when falsy is returned from concatMap
            )
            .subscribe({
                complete: () => {
                    streamCompleted = true; // Set the flag when the stream is complete
                    checkForCompletion();
                },
                error: onError, // Reject the promise if there's an error in the stream
                next: async ([handler, actionImpl]) => {
                    try {
                        activeTasks += 1;

                        const result = handler(actionCtx, actionImpl);

                        // If it's a promise, await it to ensure sequential execution
                        if (result instanceof Promise) {
                            await result;
                        }
                    } catch (error) {
                        onError(error as Error);
                    } finally {
                        if (activeTasks > 0) {
                            activeTasks -= 1;
                        }
                        checkForCompletion();
                    }
                },
            });

        // now request the action to be executed
        invokeAction(input, executionId, action, actionCtx).catch(onError);
    });
}

const noop = (): Promise<void> => Promise.resolve();

/**
 * The useActionIsLoading hook returns a boolean indicating whether the action is currently in progress. This is
 * currently only supported for single AnnotatedAction instances of actions and will return false in all other cases
 * due to the lack of loading variable to use as a source of truth.
 *
 * @param action - the action to check the loading state of
 * @returns the loading state of the action
 */
export function useActionIsLoading(action: Action | undefined | null): boolean {
    // We allow conditional logic with hooks here under the assumption that the action will never change during the
    // component lifetime. As ActionImpls have no loading variable we return false. As we expect to deprecate array's
    // of actions in the near future as all the functionality then we return false as well due to the complexity of
    // extracting potentially multiple annotated actions out of the array and resolving all their loading states
    if (!action || isActionImpl(action) || Array.isArray(action)) {
        return false;
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useVariable(action.loading)[0];
}

export function useExecuteAction(): (action: ActionImpl | ActionImpl[], input?: any) => Promise<void> | void {
    const { client: wsClient } = useContext(WebSocketCtx);
    const notificationCtx = useNotifications();
    const extras = useRequestExtras();
    const taskCtx = useTaskContext();
    const location = useLocation();
    const navigate = useNavigate();
    const eventBus = useEventBus();

    // keep actionCtx in a ref to avoid re-creating the callbacks
    const actionCtx = useRef<Omit<ActionContext, keyof CallbackInterface | 'input'>>({
        extras,
        navigate,
        location,
        notificationCtx,
        taskCtx,
        wsClient,
        eventBus,
    });

    useLayoutEffect(() => {
        actionCtx.current = {
            extras,
            navigate,
            location,
            notificationCtx,
            taskCtx,
            wsClient,
            eventBus,
        };
    });
    const callback = useRecoilCallback(
        (cbInterface) => (action: ActionImpl | ActionImpl[], input?: any) => {
            const actionsToExecute = Array.isArray(action) ? action : [action];

            // this is redefined for each action to have up-to-date snapshot
            const fullActionContext: ActionContext = {
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

            let promiseChain: Promise<void> | null = null;

            for (const act of actionsToExecute) {
                const handler = resolveActionImpl(act, fullActionContext);

                if (promiseChain) {
                    // if we already have async actions, chain this one
                    promiseChain = promiseChain.then(() => {
                        const result = handler(fullActionContext, act);
                        return result instanceof Promise ? result : Promise.resolve();
                    });
                } else {
                    // execute synchronously until we hit an async one
                    const result = handler(fullActionContext, act);
                    if (result instanceof Promise) {
                        promiseChain = result;
                    }
                }
            }

            return promiseChain || undefined;
        },
        []
    );

    return callback;
}

interface UseActionOptions {
    /**
     * Callback to invoke when an unhandled action is encountered.
     * When not defined, an error notification will be shown instead.
     *
     * @param action action implementation
     */
    onUnhandledAction?: ActionHandler;
}

/**
 * Consume an action def from the framework and return a callback function that can be used to trigger it
 * and a loading state boolean indicating whether an action is currently in progress
 *
 * @param action the action passed in
 * @param options optional extra options for the hook
 */
export default function useAction(
    action: Action | undefined | null,
    options?: UseActionOptions
): (input?: any) => Promise<void> {
    const { client: wsClient } = useContext(WebSocketCtx);
    const notificationCtx = useNotifications();
    const extras = useRequestExtras();
    const taskCtx = useTaskContext();
    const location = useLocation();
    const navigate = useNavigate();
    const eventBus = useEventBus();

    // keep actionCtx in a ref to avoid re-creating the callbacks
    const actionCtx = useRef<Omit<ActionContext, keyof CallbackInterface | 'input'>>({
        extras,
        navigate,
        location,
        notificationCtx,
        taskCtx,
        wsClient,
        eventBus,
    });
    const optionsRef = useRef(options);

    useLayoutEffect(() => {
        actionCtx.current = {
            extras,
            navigate,
            location,
            notificationCtx,
            taskCtx,
            wsClient,
            eventBus,
        };
        optionsRef.current = options;
    });

    const callback = useRecoilCallback(
        (cbInterface) => async (input: any) => {
            const actionsToExecute = Array.isArray(action) ? action : [action];

            // execute actions sequentially
            for (const actionToExecute of actionsToExecute) {
                if (!actionToExecute) {
                    continue;
                }

                const loadingVariable =
                    !isActionImpl(actionToExecute) ?
                        getOrRegisterPlainVariable(actionToExecute.loading, wsClient, taskCtx, extras)
                    :   null;

                if (loadingVariable) {
                    cbInterface.set(loadingVariable, true);
                }

                // this is redefined for each action to have up-to-date snapshot
                const fullActionContext: ActionContext = {
                    ...actionCtx.current,
                    input,
                    onUnhandledAction: optionsRef.current?.onUnhandledAction,
                    // Recoil callback interface cannot be spread as it is a Proxy
                    gotoSnapshot: cbInterface.gotoSnapshot,
                    refresh: cbInterface.refresh,
                    reset: cbInterface.reset,
                    set: cbInterface.set,
                    snapshot: cbInterface.snapshot,
                    transact_UNSTABLE: cbInterface.transact_UNSTABLE,
                };

                try {
                    // eslint-disable-next-line no-await-in-loop
                    await executeAction(input, actionToExecute, fullActionContext);
                } catch (error) {
                    // Display for easier debugging
                    // eslint-disable-next-line no-console
                    console.error(error);

                    let message = 'Try again or contact the application owner';

                    // Display the unhandled action directly as it might be helpful for developers
                    if (error instanceof UnhandledActionError) {
                        message = error.message;
                    }

                    actionCtx.current.notificationCtx.pushNotification({
                        key: '_actionError', // same key so action errors don't stack
                        message,
                        status: Status.ERROR,
                        title: 'Error executing action',
                    });
                }

                if (loadingVariable) {
                    cbInterface.set(loadingVariable, false);
                }
            }
        },
        [action]
    );

    // return a noop if no action is passed
    if (!action) {
        return noop;
    }

    return callback;
}
