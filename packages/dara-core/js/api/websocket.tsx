import { Observable, Subject } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';

import type { ActionImpl, AnyVariable } from '@/types';

const interAttemptTimeout = 500;
const maxDisconnectedTime = 10000;
const interPingInterval = 5000;
const maxAttempts = Math.round(maxDisconnectedTime / interAttemptTimeout);

let socketUrl: string = null;

let socket: WebSocket = null;
let pingInterval: NodeJS.Timeout = null;

interface InitMessage {
    message: {
        channel: 'string';
    };
    type: 'init';
}

interface PingPongMessage {
    message: null;
    type: 'ping' | 'pong';
}

export enum TaskStatus {
    CANCELED = 'CANCELED',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR',
    PROGRESS = 'PROGRESS',
}

export interface ProgressNotificationMessage {
    message: {
        message: string;
        progress: number;
        status: TaskStatus.PROGRESS;
        task_id: string;
    };
    type: 'message';
}

export interface TaskNotificationMessage {
    message: {
        status: TaskStatus;
        task_id: string;
    };
    type: 'message';
}

export interface ServerTriggerMessage {
    message: {
        data_id: string;
    };
    type: 'message';
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
        action: ActionImpl;
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
    };
    type: 'message';
}

export interface CustomMessage {
    message: {
        data: any;
        kind: string;
    };
    type: 'custom';
}

export type WebSocketMessage =
    | InitMessage
    | PingPongMessage
    | TaskNotificationMessage
    | ProgressNotificationMessage
    | ServerTriggerMessage
    | ServerErrorMessage
    | VariableRequestMessage
    | ActionMessage
    | BackendStoreMessage
    | CustomMessage;

function isInitMessage(message: WebSocketMessage): message is InitMessage {
    return message.type === 'init';
}

function isTaskNotification(message: WebSocketMessage): message is TaskNotificationMessage {
    return message.type === 'message' && 'status' in message.message && 'task_id' in message.message;
}

function isServerTriggerMessage(message: WebSocketMessage): message is ServerTriggerMessage {
    return message.type === 'message' && 'data_id' in message.message;
}

function isServerErrorMessage(message: WebSocketMessage): message is ServerErrorMessage {
    return message.type === 'message' && 'error' in message.message;
}

function isVariableRequestMessage(message: WebSocketMessage): message is VariableRequestMessage {
    return message.type === 'message' && 'variable' in message.message;
}

function isActionMessage(message: WebSocketMessage): message is ActionMessage {
    return message.type === 'message' && 'action' in message.message;
}

function isBackendStoreMessage(message: WebSocketMessage): message is BackendStoreMessage {
    return message.type === 'message' && 'store_uid' in message.message;
}

function isCustomMessage(message: WebSocketMessage): message is CustomMessage {
    return message.type === 'custom';
}

const pingMessage: PingPongMessage = {
    message: null,
    type: 'ping',
};

/**
 * Set up the heartbeat to make sure the connection is open.
 */
function setupHeartbeat(): void {
    // Send ping every few seconds
    pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(pingMessage));
        }
    }, interPingInterval);

    // Clear interval on error
    socket.addEventListener('error', () => {
        if (pingInterval) {
            clearInterval(pingInterval);
        }
    });
}

/**
 * WebSocket close event handler.
 * Tries reconnecting for a few seconds after detecting the close event,
 * and refreshes the browser on reconnect.
 */
function onCloseWs(token: string, liveReload: boolean): WebSocket {
    let attempts = 0;

    const attemptReconnect = (): WebSocket => {
        attempts++;

        if (attempts > maxAttempts) {
            // eslint-disable-next-line no-console
            console.error('Could not reconnect to server');
            return;
        }

        // Try reconnecting
        const url = new URL(socketUrl);
        url.searchParams.set('token', token);

        socket = new WebSocket(url);
        // If reconnect failed, retry after some time
        socket.addEventListener('error', () => {
            setTimeout(attemptReconnect, interAttemptTimeout);
        });

        if (liveReload) {
            // On reconnect, reload page
            socket.addEventListener('open', () => {
                socket.addEventListener('close', () => {
                    // If socket failed to open and closed again before getting a message, attempt again
                    attemptReconnect();
                });

                setupHeartbeat();

                socket.addEventListener('message', (ev) => {
                    const msg = JSON.parse(ev.data) as WebSocketMessage;
                    if (msg.type === 'init') {
                        // Reload once app successfully initialized
                        window.location.reload();
                    }
                });
            });
        }
        return socket;
    };

    return attemptReconnect();
}

export interface WebSocketClientInterface {
    actionMessages$: (executionId: string) => Observable<ActionImpl>;
    backendStoreMessages$(): Observable<BackendStoreMessage['message']>;
    channel$: () => Observable<string>;
    customMessages$: () => Observable<CustomMessage>;
    getChannel: () => Promise<string>;
    progressUpdates$: (...task_ids: string[]) => Observable<ProgressNotificationMessage>;
    sendCustomMessage: (kind: string, data: any) => void;
    sendVariable: (value: any, channel: string) => void;
    serverErrors$: () => Observable<ServerErrorMessage>;
    serverTriggers$: (data_id: string) => Observable<ServerTriggerMessage>;
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

    constructor(_socket: WebSocket, _token: string, _liveReload = false) {
        this.socket = _socket;
        this.token = _token;
        this.liveReload = _liveReload;
        this.messages$ = new Subject();
        this.closeHandler = this.onClose.bind(this);
        this.initialize();
    }

    initialize(): void {
        // Register the message event listener to start the stream of messages and get the new channel
        this.socket.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data) as WebSocketMessage;
            this.messages$.next(msg);
        });
        // Update the channel on the class and broadcast the init message to subscribers
        this.channel = new Promise((resolve) => {
            this.socket.addEventListener('message', (ev) => {
                const msg = JSON.parse(ev.data) as WebSocketMessage;
                if (msg.type === 'init') {
                    this.messages$.next(msg);
                    resolve(msg.message?.channel);
                }
            });
        });
        // Rebind the close handler so this logic is re-applied on a subsequent disconnect
        this.socket.addEventListener('close', this.closeHandler);
    }

    /**
     * Close handler to attempt to reconnect on WS closed
     */
    onClose(): void {
        this.socket = onCloseWs(this.token, this.liveReload);
        this.initialize();
    }

    /**
     * Forcefully close the websocket connection, first clearing the closehandler
     */
    close(): void {
        clearInterval(pingInterval);
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
            filter((msg) => isTaskNotification(msg) && task_ids.includes(msg.message.task_id)),
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
     * Get the observable to receive server trigger messages for a given data variable
     *
     * @param dataId id of the data variable triggered
     */
    serverTriggers$(dataId: string): Observable<ServerTriggerMessage> {
        return this.messages$.pipe(
            filter(isServerTriggerMessage),
            filter((msg) => msg.message?.data_id === dataId)
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
    actionMessages$(executionId: string): Observable<ActionImpl> {
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
     * Returns a promise that will resolve when the task is completed. If the task is cancelled then this will throw an
     * error to signify that.
     *
     * @param task_id the id of the task to wait for
     */
    waitForTask(task_id: string): Promise<any> {
        return this.messages$
            .pipe(
                filter(
                    (msg) =>
                        isTaskNotification(msg) &&
                        msg.message?.task_id === task_id &&
                        msg.message.status !== TaskStatus.PROGRESS // don't take progress updates
                ),
                map((msg) => {
                    if (isTaskNotification(msg) && msg.message.status === TaskStatus.CANCELED) {
                        throw new Error('CANCELED');
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
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    channel,
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
     */
    sendCustomMessage(kind: string, data: any): void {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    message: {
                        data,
                        kind,
                    },
                    type: 'custom',
                } as CustomMessage)
            );
        }
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

    socketUrl = `${window.location.protocol === 'https:' ? 'wss://' : 'ws://'}${host}/api/core/ws`;

    // Append session token to the WS url for authentication
    const url = new URL(socketUrl);
    url.searchParams.set('token', sessionToken);

    socket = new WebSocket(url);

    setupHeartbeat();

    return new WebSocketClient(socket, sessionToken, liveReload);
}
