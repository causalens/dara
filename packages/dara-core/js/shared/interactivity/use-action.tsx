import groupBy from 'lodash/groupBy';
import { nanoid } from 'nanoid';
import { useContext, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { type CallbackInterface, type RecoilState, useRecoilCallback } from 'recoil';
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

// Names of batch framing markers sent by the server
const BATCH_START = 'BatchStart';
const BATCH_END = 'BatchEnd';

/*
 * ── Batch buffering ──────────────────────────────────────────────────────────
 *
 * `transact_UNSTABLE` requires a **synchronous** callback, and some action
 * handlers are async so we cannot buffer all ActionImpl objects and execute
 * them inside a single `transact_UNSTABLE` call.
 *
 * Instead we:
 *   1. Run handlers normally as they arrive, but with a recording `ActionContext`
 *      that captures `set` / `reset` / `eventBus.publish` calls into arrays
 *      instead of applying them.
 *   2. On `BatchEnd`, replay all recorded Recoil operations inside a single
 *      synchronous `transact_UNSTABLE` call, then run deferred callbacks.
 *
 * This gives us atomic Recoil updates (one React render) while still supporting
 * async handlers.
 */

/**
 * A recorded Recoil operation captured during a batch.
 * Replayed inside `transact_UNSTABLE` when the batch ends.
 *
 * - `set`: direct value assignment, e.g. `ctx.set(atom, 42)`
 * - `set-update`: updater function, e.g. `ctx.set(atom, prev => prev + 1)`.
 *    The updater is stored as-is and resolved at replay time via the transaction's
 *    `get`, which correctly chains multiple updaters on the same atom.
 * - `reset`: atom reset to default value
 */
type RecordedRecoilOp =
    | { type: 'set'; atom: RecoilState<unknown>; value: unknown }
    | { type: 'set-update'; atom: RecoilState<unknown>; updater: (prev: unknown) => unknown }
    | { type: 'reset'; atom: RecoilState<unknown> };

/**
 * Mutable batch state shared across an action execution.
 * When `active` is true, all action handlers write to `ops` via a recording
 * context, and side-effect callbacks are deferred until the batch is applied.
 */
interface BatchState {
    /** Whether we are currently inside a batch (between BatchStart and BatchEnd). */
    active: boolean;
    /** Recorded Recoil set/reset operations to replay atomically. */
    ops: RecordedRecoilOp[];
    /** Side-effect callbacks (from event bus publishes etc.) deferred until after the batch is applied. */
    deferredCallbacks: Array<() => void>;
}

/**
 * Create an `ActionContext` that records `set` / `reset` / `eventBus.publish`
 * calls into `batch` instead of applying them immediately.
 *
 * The recording is intentionally simple: values and updater functions are stored
 * as-is with no attempt to resolve or chain them here. Resolution happens at
 * replay time inside `transact_UNSTABLE` (see `applyBatch`), where the
 * transaction's `get` provides correct read-after-write semantics for chained
 * updaters on the same atom.
 */
function createBatchingContext(realCtx: ActionContext, batch: BatchState): ActionContext {
    // `function` declaration (not arrow) to avoid TSX generic-arrow-function ambiguity with <T>
    function batchSet<T>(atom: RecoilState<T>, valOrUpdater: T | ((prev: T) => T)): void {
        if (typeof valOrUpdater === 'function') {
            batch.ops.push({
                type: 'set-update',
                atom: atom as RecoilState<unknown>,
                updater: valOrUpdater as (prev: unknown) => unknown,
            });
        } else {
            batch.ops.push({ type: 'set', atom: atom as RecoilState<unknown>, value: valOrUpdater });
        }
    }

    return {
        ...realCtx,
        set: batchSet,
        reset: (atom: RecoilState<unknown>) => {
            batch.ops.push({ type: 'reset', atom });
        },
        // eventBus is wrapped so that publishes are deferred until after the batch
        eventBus: {
            ...realCtx.eventBus,
            publish: (...args: Parameters<typeof realCtx.eventBus.publish>) => {
                batch.deferredCallbacks.push(() => realCtx.eventBus.publish(...args));
            },
        },
    };
}

/**
 * Apply all recorded operations atomically via `transact_UNSTABLE`, then run deferred callbacks.
 *
 * Inside the transaction, `get` reads the latest value *within the transaction*,
 * so chained updaters on the same atom resolve correctly: the first updater sets
 * the value, and the second updater's `get` sees the first's result.
 */
function applyBatch(realCtx: ActionContext, batch: BatchState): void {
    if (batch.ops.length > 0) {
        realCtx.transact_UNSTABLE(({ set, reset, get }) => {
            for (const op of batch.ops) {
                if (op.type === 'set') {
                    set(op.atom, op.value);
                } else if (op.type === 'set-update') {
                    const current = get(op.atom);
                    set(op.atom, op.updater(current));
                } else {
                    reset(op.atom);
                }
            }
        });
    }

    // Run deferred side-effect callbacks (event bus publishes, etc.)
    for (const cb of batch.deferredCallbacks) {
        cb();
    }

    // Clear the batch
    batch.ops = [];
    batch.deferredCallbacks = [];
}

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

    await handleAuthErrors(res, { authenticationFailureRedirect: 'login' });
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

        // Batch state: when active, state-mutating actions are buffered and applied atomically on BatchEnd
        const batch: BatchState = { active: false, ops: [], deferredCallbacks: [] };

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
                        return actionImpl;
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
                next: async (actionImpl) => {
                    try {
                        // Handle batch framing markers
                        if (actionImpl.name === BATCH_START) {
                            batch.active = true;
                            return;
                        }

                        if (actionImpl.name === BATCH_END) {
                            applyBatch(actionCtx, batch);
                            batch.active = false;
                            return;
                        }

                        activeTasks += 1;

                        const handler = resolveActionImpl(actionImpl, actionCtx);
                        // When inside a batch, all handlers receive a recording context that
                        // captures set/reset/eventBus calls for atomic application on BatchEnd
                        const ctx = batch.active ? createBatchingContext(actionCtx, batch) : actionCtx;
                        const result = handler(ctx, actionImpl);
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
