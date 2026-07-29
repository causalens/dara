/* eslint-disable max-classes-per-file */
import { nanoid } from 'nanoid';
import { Observable, Subject } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { z } from 'zod/v4';

import { HTTP_METHOD } from '@darajs/ui-utils';

import { handleAuthErrors } from '@/auth/auth';
import type { ActionImpl, AnyVariable } from '@/types';

import { request } from './http';

const interAttemptTimeout = 500;
const maxDisconnectedTime = 10000;
const interPingInterval = 5000;
const maxAttempts = Math.round(maxDisconnectedTime / interAttemptTimeout);

export class TaskCancelledError extends Error {
    task_id: string;

    constructor(message: string, task_id: string) {
        super(message);
        this.task_id = task_id;
    }
}

export class TaskError extends Error {
    task_id: string;

    constructor(message: string, task_id: string) {
        super(message);
        this.task_id = task_id;
    }
}

export enum TaskStatus {
    CANCELED = 'CANCELED',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
    PROGRESS = 'PROGRESS',
}

export enum ServerMessageTypename {
    ACTION = 'ActionMessage',
    BACKEND_STORE = 'BackendStoreMessage',
    BACKEND_STORE_PATCH = 'BackendStorePatchMessage',
    SERVER_ERROR = 'ServerErrorMessage',
    SERVER_VARIABLE = 'ServerVariableMessage',
    TASK_NOTIFICATION = 'TaskNotificationMessage',
    VARIABLE_REQUEST = 'VariableRequestMessage',
}

const initMessageSchema = z.object({
    message: z.object({ channel: z.string() }),
    type: z.literal('init'),
});
type InitMessage = z.infer<typeof initMessageSchema>;

const pingPongMessageSchema = z.object({
    message: z.null(),
    type: z.union([z.literal('ping'), z.literal('pong')]),
});
type PingPongMessage = z.infer<typeof pingPongMessageSchema>;

const taskNotificationContentSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal(TaskStatus.COMPLETE), task_id: z.string() }).passthrough(),
    z.object({ status: z.literal(TaskStatus.ERROR), task_id: z.string(), error: z.string() }).passthrough(),
    z
        .object({
            status: z.literal(TaskStatus.PROGRESS),
            task_id: z.string(),
            progress: z.number(),
            message: z.string(),
        })
        .passthrough(),
    z.object({ status: z.literal(TaskStatus.CANCELED), task_id: z.string() }).passthrough(),
]);

export const taskNotificationMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.TASK_NOTIFICATION),
    message: taskNotificationContentSchema,
    type: z.literal('message'),
});
export type TaskNotificationMessage = z.infer<typeof taskNotificationMessageSchema>;

export type ProgressNotificationMessage = TaskNotificationMessage & {
    message: Extract<TaskNotificationMessage['message'], { status: TaskStatus.PROGRESS }>;
};

export const serverErrorMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.SERVER_ERROR),
    message: z.object({
        error: z.string(),
        time: z.string(),
    }),
    type: z.literal('message'),
});
export type ServerErrorMessage = z.infer<typeof serverErrorMessageSchema>;

export const variableRequestMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.VARIABLE_REQUEST),
    message: z.object({
        /** Channel to send in the response */
        __rchan: z.string(),
        variable: z.custom<AnyVariable<any>>(),
    }),
    type: z.literal('message'),
});
export type VariableRequestMessage = z.infer<typeof variableRequestMessageSchema>;

export const actionMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.ACTION),
    message: z.object({
        /**
         * Action implementation instance
         */
        action: z.custom<ActionImpl>().nullable(),
        /**
         * Execution uid
         */
        uid: z.string(),
    }),
    type: z.literal('message'),
});
export type ActionMessage = z.infer<typeof actionMessageSchema>;

export const backendStoreMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.BACKEND_STORE),
    message: z.object({
        store_uid: z.string(),
        value: z.any(),
        sequence_number: z.number(),
    }),
    type: z.literal('message'),
});
export type BackendStoreMessage = z.infer<typeof backendStoreMessageSchema>;

export const backendStorePatchMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.BACKEND_STORE_PATCH),
    message: z.object({
        store_uid: z.string(),
        patches: z.array(
            z.object({
                op: z.union([
                    z.literal('add'),
                    z.literal('remove'),
                    z.literal('replace'),
                    z.literal('move'),
                    z.literal('copy'),
                    z.literal('test'),
                ]),
                path: z.string(),
                value: z.any().optional(),
                from: z.string().optional(),
            })
        ),
        sequence_number: z.number(),
    }),
    type: z.literal('message'),
});
export type BackendStorePatchMessage = z.infer<typeof backendStorePatchMessageSchema>;

export const serverVariableMessageSchema = z.object({
    __typename: z.literal(ServerMessageTypename.SERVER_VARIABLE),
    message: z.object({
        __type: z.literal('ServerVariable'),
        uid: z.string(),
        sequence_number: z.number(),
    }),
    type: z.literal('message'),
});
export type ServerVariableMessage = z.infer<typeof serverVariableMessageSchema>;

export const customMessageSchema = z.object({
    message: z.object({
        data: z.any(),
        kind: z.string(),
        /** Optional ID, returned from server custom messages coming as a response for a custom client message */
        __response_for: z.string().optional(),
        /** Optional ID, should be included as `__response_for` when the server responds to this message */
        __rchan: z.string().optional(),
    }),
    type: z.literal('custom'),
});
export type CustomMessage = z.infer<typeof customMessageSchema>;

export const firstPartyServerMessageSchema = z.discriminatedUnion('__typename', [
    taskNotificationMessageSchema,
    serverErrorMessageSchema,
    variableRequestMessageSchema,
    actionMessageSchema,
    backendStoreMessageSchema,
    backendStorePatchMessageSchema,
    serverVariableMessageSchema,
]);

export const webSocketMessageSchema = z.union([
    initMessageSchema,
    pingPongMessageSchema,
    firstPartyServerMessageSchema,
    customMessageSchema,
]);
export type WebSocketMessage = z.infer<typeof webSocketMessageSchema>;

export function isInitMessage(message: WebSocketMessage): message is InitMessage {
    return message.type === 'init';
}

export function isTaskNotification(message: WebSocketMessage): message is TaskNotificationMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.TASK_NOTIFICATION;
}

export function isServerVariableMessage(message: WebSocketMessage): message is ServerVariableMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.SERVER_VARIABLE;
}

export function isServerErrorMessage(message: WebSocketMessage): message is ServerErrorMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.SERVER_ERROR;
}

export function isVariableRequestMessage(message: WebSocketMessage): message is VariableRequestMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.VARIABLE_REQUEST;
}

export function isActionMessage(message: WebSocketMessage): message is ActionMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.ACTION;
}

export function isBackendStoreMessage(message: WebSocketMessage): message is BackendStoreMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.BACKEND_STORE;
}

export function isBackendStorePatchMessage(message: WebSocketMessage): message is BackendStorePatchMessage {
    return message.type === 'message' && message.__typename === ServerMessageTypename.BACKEND_STORE_PATCH;
}

export function isCustomMessage(message: WebSocketMessage): message is CustomMessage {
    return message.type === 'custom';
}

const pingMessage: PingPongMessage = {
    message: null,
    type: 'ping',
};

export interface WebSocketClientInterface {
    actionMessages$: (executionId: string) => Observable<ActionImpl | null>;
    backendStoreMessages$(): Observable<BackendStoreMessage['message']>;
    backendStorePatchMessages$(): Observable<BackendStorePatchMessage['message']>;
    serverVariableMessages$(): Observable<ServerVariableMessage['message']>;
    channel$: () => Observable<string>;
    customMessages$: () => Observable<CustomMessage>;
    getChannel: () => Promise<string>;
    progressUpdates$: (...task_ids: string[]) => Observable<ProgressNotificationMessage>;
    sendCustomMessage(kind: string, data: any, awaitResponse?: boolean): Promise<CustomMessage | null>;
    sendMessage(value: any, channel: string, chunkCount?: number): void;
    sendVariable: (value: any, channel: string) => void;
    serverErrors$: () => Observable<ServerErrorMessage>;
    taskStatusUpdates$: (...task_ids: string[]) => Observable<TaskStatus>;
    variableRequests$: () => Observable<VariableRequestMessage>;
    waitForTask: (task_id: string) => Promise<any>;
}

/**
 * The WebsocketClient class exposes an interface for easily dealing with the websocket connection to the Dara backend.
 * It provides easy helpers for fetching the current channel and working with tasks.
 */
export class WebSocketClient implements WebSocketClientInterface {
    channel: Promise<string>;

    messages$: Subject<WebSocketMessage>;

    socket: WebSocket;

    liveReload: boolean;

    closeHandler: ((event: CloseEvent) => void) | null;

    maxAttempts: number;

    maxAttemptsReached: boolean;

    #pingInterval: NodeJS.Timeout | null;

    #socketUrl: string;

    #reconnectCount: number;

    #reconnectTimeout: NodeJS.Timeout | null;

    #resumeSignalHandler: () => void;

    #visibilityResumeHandler: () => void;

    #resumeListenersAttached: boolean;

    #authVerificationPromise: Promise<void> | null;

    #authVerificationReconnectUsed: boolean;

    constructor(_socketUrl: string, _liveReload = false) {
        this.liveReload = _liveReload;
        this.messages$ = new Subject();
        this.closeHandler = null;
        this.maxAttempts = maxAttempts;
        this.maxAttemptsReached = false;
        this.#socketUrl = _socketUrl;
        this.#reconnectCount = 0;
        this.#pingInterval = null;
        this.#reconnectTimeout = null;
        this.#resumeSignalHandler = this.onResumeSignal.bind(this);
        this.#visibilityResumeHandler = this.onVisibilityResumeSignal.bind(this);
        this.#resumeListenersAttached = false;
        this.#authVerificationPromise = null;
        this.#authVerificationReconnectUsed = false;

        // Satisfy TSC, channel is set within initialize again
        this.channel = Promise.resolve('');

        // Lastly call initialize to setup the socket properly
        this.socket = this.initialize();
    }

    initialize(isReconnect = false): WebSocket {
        // Create the underlying socket instance from the url.
        const socket = new WebSocket(this.#socketUrl);
        let receivedInit = false;

        // Send heartbeat to ping every few seconds and clear it on error
        this.#pingInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(pingMessage));
            }
        }, interPingInterval);
        socket.addEventListener('error', () => {
            if (this.#pingInterval) {
                clearInterval(this.#pingInterval);
            }
        });

        // Register the message event listener to start the stream of messages and get the new channel
        socket.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data) as WebSocketMessage;
            this.messages$.next(msg);
        });

        // Update the channel on the class and broadcast the init message to subscribers
        this.channel = new Promise((resolve) => {
            const handler = (ev: MessageEvent<any>): void => {
                const msg = JSON.parse(ev.data) as WebSocketMessage;
                if (msg.type === 'init') {
                    receivedInit = true;
                    this.#reconnectCount = 0;
                    this.maxAttemptsReached = false;
                    this.#authVerificationReconnectUsed = false;
                    this.removeReconnectResumeListeners();
                    this.messages$.next(msg);

                    // Remove the handler after the channel is received and then resolve the promise
                    socket.removeEventListener('message', handler);
                    resolve(msg.message?.channel);

                    // If liveReload is true and this is a reconnect attempt then reload the page
                    if (this.liveReload && isReconnect) {
                        window.location.reload();
                    }
                }
            };
            socket.addEventListener('message', handler);
        });

        // Bind the close handler so the re-initialize logic is added every time
        this.closeHandler = () => {
            if (!receivedInit) {
                this.verifySessionAfterFailedConnect().catch(() => undefined);
            }

            this.onClose();
        };
        socket.addEventListener('close', this.closeHandler);
        return socket;
    }

    async verifySessionAfterFailedConnect(): Promise<void> {
        if (this.#authVerificationPromise) {
            return this.#authVerificationPromise;
        }

        // Browser WS APIs do not expose failed handshake status codes, so re-use
        // the HTTP auth verification path to decide between refresh/login/error recovery.
        this.#authVerificationPromise = (async () => {
            try {
                const response = await request('/api/auth/verify-session', {
                    method: HTTP_METHOD.POST,
                });

                if (!response.ok) {
                    await handleAuthErrors(response);
                    return;
                }

                this.resumeAfterSuccessfulAuthVerification();
            } catch {
                // Ignore transient network/server failures and let the reconnect loop continue.
            } finally {
                this.#authVerificationPromise = null;
            }
        })();

        return this.#authVerificationPromise;
    }

    resumeAfterSuccessfulAuthVerification(): void {
        if (this.#authVerificationReconnectUsed) {
            return;
        }

        this.resumeReconnectBurst(true);
    }

    addReconnectResumeListeners(): void {
        if (this.#resumeListenersAttached) {
            return;
        }

        document.addEventListener('visibilitychange', this.#visibilityResumeHandler);
        window.addEventListener('focus', this.#resumeSignalHandler);
        window.addEventListener('online', this.#resumeSignalHandler);
        this.#resumeListenersAttached = true;
    }

    removeReconnectResumeListeners(): void {
        if (!this.#resumeListenersAttached) {
            return;
        }

        document.removeEventListener('visibilitychange', this.#visibilityResumeHandler);
        window.removeEventListener('focus', this.#resumeSignalHandler);
        window.removeEventListener('online', this.#resumeSignalHandler);
        this.#resumeListenersAttached = false;
    }

    resumeReconnectBurst(authVerificationReconnectUsed = false): void {
        if (!this.maxAttemptsReached) {
            return;
        }

        this.#reconnectCount = 0;
        this.maxAttemptsReached = false;
        this.#authVerificationReconnectUsed = authVerificationReconnectUsed;
        this.removeReconnectResumeListeners();
        this.socket = this.initialize(true);
    }

    onResumeSignal(): void {
        this.resumeReconnectBurst();
    }

    onVisibilityResumeSignal(): void {
        if (document.visibilityState === 'visible') {
            this.resumeReconnectBurst();
        }
    }

    /**
     * Close handler to attempt to reconnect on WS closed
     */
    onClose(): void {
        if (this.#reconnectCount >= this.maxAttempts) {
            // eslint-disable-next-line no-console
            console.error('Could not reconnect the websocket to the server');

            this.maxAttemptsReached = true;
            this.addReconnectResumeListeners();
            return;
        }
        this.#reconnectTimeout = setTimeout(() => {
            this.#reconnectTimeout = null;
            this.#reconnectCount++;
            this.socket = this.initialize(true);
        }, interAttemptTimeout);
    }

    /**
     * Forcefully close the websocket connection, first clearing the closehandler
     */
    close(): void {
        if (this.#pingInterval) {
            clearInterval(this.#pingInterval);
        }
        if (this.#reconnectTimeout) {
            clearTimeout(this.#reconnectTimeout);
            this.#reconnectTimeout = null;
        }
        this.removeReconnectResumeListeners();
        if (this.closeHandler) {
            this.socket.removeEventListener('close', this.closeHandler);
        }
        this.socket.close();
    }

    /**
     * Get the channel setup for this websocket client instance
     */
    getChannel(): Promise<string> {
        return this.channel;
    }

    backendStoreMessages$(): Observable<BackendStoreMessage['message']> {
        return this.messages$.pipe(
            filter(isBackendStoreMessage),
            map((msg) => msg.message)
        );
    }

    backendStorePatchMessages$(): Observable<BackendStorePatchMessage['message']> {
        return this.messages$.pipe(
            filter(isBackendStorePatchMessage),
            map((msg) => msg.message)
        );
    }

    serverVariableMessages$(): Observable<ServerVariableMessage['message']> {
        return this.messages$.pipe(
            filter(isServerVariableMessage),
            map((msg) => msg.message)
        );
    }

    /**
     * Get the observable to receive the new channel when the socket reconnects
     */
    channel$(): Observable<string> {
        return this.messages$.pipe(
            filter((msg) => isInitMessage(msg)),
            map((msg: InitMessage) => msg.message.channel)
        );
    }

    /**
     * Get the observable to receive status updates for given tasks
     *
     * @param task_ids the ids of tasks to receive updates from
     */
    taskStatusUpdates$(...task_ids: string[]): Observable<TaskStatus> {
        return this.messages$.pipe(
            filter(
                (msg): msg is TaskNotificationMessage =>
                    isTaskNotification(msg) && task_ids.includes(msg.message.task_id)
            ),
            map((msg: TaskNotificationMessage) => msg.message.status)
        );
    }

    /**
     * Get the observable to receive progress updates for given tasks
     *
     * @param task_ids the ids of the task to receive updates from
     */
    progressUpdates$(...task_ids: string[]): Observable<ProgressNotificationMessage> {
        return this.messages$.pipe(
            filter(
                (msg): msg is ProgressNotificationMessage =>
                    isTaskNotification(msg) &&
                    msg.message.status === TaskStatus.PROGRESS &&
                    task_ids.includes(msg.message.task_id)
            )
        );
    }

    /**
     * Get the observable to receive server error messages
     */
    serverErrors$(): Observable<ServerErrorMessage> {
        return this.messages$.pipe(filter(isServerErrorMessage));
    }

    /**
     * Get the observable to receive variable request messages
     */
    variableRequests$(): Observable<VariableRequestMessage> {
        return this.messages$.pipe(filter(isVariableRequestMessage));
    }

    /**
     * Get the observable to receive action implementations to execute for a given execution id
     *
     * @param executionId id of the execution to receive action implementations for
     */
    actionMessages$(executionId: string): Observable<ActionImpl | null> {
        return this.messages$.pipe(
            filter((msg): msg is ActionMessage => isActionMessage(msg) && msg.message.uid === executionId),
            map((msg) => msg.message.action)
        );
    }

    /**
     * Get the observable to receive custom messages
     */
    customMessages$(): Observable<CustomMessage> {
        return this.messages$.pipe(filter(isCustomMessage));
    }

    /**
     * Returns a promise that will resolve when the task is completed. If the task is cancelled or errored then this will throw an
     * error to signify that.
     *
     * @param task_id the id of the task to wait for
     */
    waitForTask(task_id: string): Promise<any> {
        return this.messages$
            .pipe(
                filter((msg): msg is TaskNotificationMessage => {
                    return (
                        isTaskNotification(msg) &&
                        msg.message?.task_id === task_id &&
                        msg.message.status !== TaskStatus.PROGRESS
                    ); // don't take progress updates
                }),
                map((msg) => {
                    if (msg.message.status === TaskStatus.CANCELED) {
                        throw new TaskCancelledError('Task was cancelled', msg.message.task_id);
                    } else if (msg.message.status === TaskStatus.ERROR) {
                        throw new TaskError(msg.message.error, msg.message.task_id);
                    }

                    return msg;
                }),
                take(1)
            )
            .toPromise();
    }

    /**
     * Send variable value to the backend
     *
     * @param value variable value to send
     * @param channel return channel to identify the message
     */
    sendVariable(value: any, channel: string): void {
        this.sendMessage(value, channel);
    }

    /**
     * Send an internal message to the backend. This is used to respond to sendAndWait calls from the backend.
     *
     * @param value variable value to send
     * @param channel return channel to identify the message
     * @param chunkCount total number of chunks this message has been split into
     */
    sendMessage(value: any, channel: string, chunkCount?: number): void {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    channel,
                    chunk_count: chunkCount ?? null,
                    message: value,
                    type: 'message',
                })
            );
        }
    }

    /**
     * Send custom message to the backend
     *
     * @param kind kind of custom message
     * @param data custom message data
     * @param awaitResponse whether to await a response for this message
     */
    sendCustomMessage(kind: string, data: any, awaitResponse: boolean = false): Promise<CustomMessage | null> {
        if (this.socket.readyState === WebSocket.OPEN) {
            // if awaiting response, setup a subscription to the response channel
            if (awaitResponse) {
                const rchan = nanoid();

                return new Promise((resolve) => {
                    const subscription = this.customMessages$()
                        .pipe()
                        .subscribe({
                            next: (msg) => {
                                if (msg.message.__response_for === rchan) {
                                    resolve(msg);
                                    subscription.unsubscribe();
                                }
                            },
                        });

                    this.socket.send(
                        JSON.stringify({
                            message: {
                                data,
                                kind,
                                __rchan: rchan,
                            },
                            type: 'custom',
                        } as CustomMessage)
                    );
                });
            }

            // otherwise just fire and forget a message
            this.socket.send(
                JSON.stringify({
                    message: {
                        data,
                        kind,
                    },
                    type: 'custom',
                } as CustomMessage)
            );
            return Promise.resolve(null);
        }

        return Promise.resolve(null);
    }
}

/**
 * Set up websocket connection and handlers.
 *
 * @param liveReload whether to enable live reload
 */
export function setupWebsocket(liveReload: boolean): WebSocketClient {
    // Setup socket url
    let { host } = window.location;

    if (window.dara?.base_url) {
        const baseUrl = new URL(window.dara.base_url, window.origin);
        let { pathname } = baseUrl;

        if (pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }

        host = baseUrl.host + pathname;
    }

    const socketUrl = `${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}${host}/api/core/ws`;

    return new WebSocketClient(socketUrl, liveReload);
}
