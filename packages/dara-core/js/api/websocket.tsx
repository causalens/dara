/* eslint-disable max-classes-per-file */
import { nanoid } from 'nanoid';
import { Observable, Subject } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import globalStore from '@/shared/global-state-store';
import { getTokenKey } from '@/shared/utils/embed';
import type { ActionImpl, AnyVariable } from '@/types';

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

interface InitMessage {
    message: {
        channel: string;
    };
    type: 'init';
}

interface PingPongMessage {
    message: null;
    type: 'ping' | 'pong';
}

interface TokenUpdateMessage {
    message: string;
    type: 'token_update';
}

export enum TaskStatus {
    CANCELED = 'CANCELED',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
    PROGRESS = 'PROGRESS',
}

type TaskNotificationMessageContent =
    | { status: TaskStatus.COMPLETE; task_id: string }
    | { status: TaskStatus.ERROR; task_id: string; error: string }
    | { status: TaskStatus.PROGRESS; task_id: string; progress: number; message: string }
    | { status: TaskStatus.CANCELED; task_id: string };

export interface TaskNotificationMessage {
    message: TaskNotificationMessageContent;
    type: 'message';
}

export interface ProgressNotificationMessage {
    type: 'message';
    message: Extract<TaskNotificationMessageContent, { status: TaskStatus.PROGRESS }>;
}

export interface ServerErrorMessage {
    message: {
        error: string;
        time: string;
    };
    type: 'message';
}

export interface VariableRequestMessage {
    message: {
        /** Channel to send in the response */
        __rchan: string;
        variable: AnyVariable<any>;
    };
    type: 'message';
}

export interface ActionMessage {
    message: {
        /**
         * Action implementation instance
         */
        action: ActionImpl | null;
        /**
         * Execution uid
         */
        uid: string;
    };
    type: 'message';
}

export interface BackendStoreMessage {
    message: {
        store_uid: string;
        value: any;
        sequence_number: number;
    };
    type: 'message';
}

export interface BackendStorePatchMessage {
    message: {
        store_uid: string;
        patches: Array<{
            op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
            path: string;
            value?: any;
            from?: string;
        }>;
        sequence_number: number;
    };
    type: 'message';
}

export interface ServerVariableMessage {
    message: {
        __type: 'ServerVariable';
        uid: string;
        sequence_number: number;
    };
    type: 'message';
}

export interface CustomMessage {
    message: {
        data: any;
        kind: string;
        /** Optional ID, returned from server custom messages coming as a response for a custom client message */
        __response_for?: string;
        /** Optional ID, should be included as `__response_for` when the server responds to this message */
        __rchan?: string;
    };
    type: 'custom';
}

export type WebSocketMessage =
    | InitMessage
    | PingPongMessage
    | TokenUpdateMessage
    | TaskNotificationMessage
    | ProgressNotificationMessage
    | ServerErrorMessage
    | ServerVariableMessage
    | VariableRequestMessage
    | ActionMessage
    | BackendStoreMessage
    | BackendStorePatchMessage
    | CustomMessage;

export function isInitMessage(message: WebSocketMessage): message is InitMessage {
    return message.type === 'init';
}

export function isTaskNotification(message: WebSocketMessage): message is TaskNotificationMessage {
    return message.type === 'message' && 'status' in message.message && 'task_id' in message.message;
}

export function isServerVariableMessage(message: WebSocketMessage): message is ServerVariableMessage {
    return message.type === 'message' && '__type' in message.message && message.message.__type === 'ServerVariable';
}

export function isServerErrorMessage(message: WebSocketMessage): message is ServerErrorMessage {
    return message.type === 'message' && 'error' in message.message;
}

export function isVariableRequestMessage(message: WebSocketMessage): message is VariableRequestMessage {
    return message.type === 'message' && 'variable' in message.message;
}

export function isActionMessage(message: WebSocketMessage): message is ActionMessage {
    return message.type === 'message' && 'action' in message.message;
}

export function isBackendStoreMessage(message: WebSocketMessage): message is BackendStoreMessage {
    return message.type === 'message' && 'store_uid' in message.message && 'value' in message.message;
}

export function isBackendStorePatchMessage(message: WebSocketMessage): message is BackendStorePatchMessage {
    return message.type === 'message' && 'store_uid' in message.message && 'patches' in message.message;
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

    token: string;

    liveReload: boolean;

    closeHandler: () => void;

    maxAttempts: number;

    maxAttemptsReached: boolean;

    #pingInterval: NodeJS.Timeout | null;

    #socketUrl: string;

    #reconnectCount: number;

    constructor(_socketUrl: string, _token: string, _liveReload = false) {
        this.token = _token;
        this.liveReload = _liveReload;
        this.messages$ = new Subject();
        this.closeHandler = this.onClose.bind(this);
        this.maxAttempts = maxAttempts;
        this.maxAttemptsReached = false;
        this.#socketUrl = _socketUrl;
        this.#reconnectCount = 0;
        this.#pingInterval = null;

        // Satisfy TSC, channel is set within initialize again
        this.channel = Promise.resolve('');

        // Lastly call initialize to setup the socket properly
        this.socket = this.initialize();
    }

    initialize(isReconnect = false): WebSocket {
        // Create the underlying socket instance from the url and token
        const url = new URL(this.#socketUrl);

        // Get the latest token from the global store to ensure it's always up to date
        this.token = globalStore.getValueSync(getTokenKey())!;

        // Set the token on the params of the request
        url.searchParams.set('token', this.token);
        const socket = new WebSocket(url);

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
                    this.#reconnectCount = 0;
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
        socket.addEventListener('close', this.closeHandler);
        return socket;
    }

    /**
     * Close handler to attempt to reconnect on WS closed
     */
    onClose(): void {
        if (this.#reconnectCount >= this.maxAttempts) {
            // eslint-disable-next-line no-console
            console.error('Could not reconnect the websocket to the server');

            // Add a visibility change listener to attempt the connection again when the tab becomes visible again
            const handler = (): void => {
                if (document.visibilityState === 'visible') {
                    // Reset the retry loop and attempt to initialize the socket again
                    this.#reconnectCount = 0;
                    this.socket = this.initialize();

                    // Remove the visibility change listener after we enter the retry loop again
                    document.removeEventListener('visibilitychange', handler);
                    this.maxAttemptsReached = false;
                }
            };
            document.addEventListener('visibilitychange', handler);
            this.maxAttemptsReached = true;
            return;
        }
        setTimeout(() => {
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
        this.socket.removeEventListener('close', this.closeHandler);
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
     * Send a 'token_update' message to the backend to notify the live connection
     * that a token for the current session has been updated (refreshed).
     *
     * @param newToken new session token
     */
    updateToken(newToken: string): void {
        this.token = newToken;
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    message: newToken,
                    type: 'token_update',
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
 * @param sessionToken session token
 * @param liveReload whether to enable live reload
 */
export function setupWebsocket(sessionToken: string, liveReload: boolean): WebSocketClient {
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

    // Append session token to the WS url for authentication
    const url = new URL(socketUrl);
    url.searchParams.set('token', sessionToken);

    return new WebSocketClient(socketUrl, sessionToken, liveReload);
}
