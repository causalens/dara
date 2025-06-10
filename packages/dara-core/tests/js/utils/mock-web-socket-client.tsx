import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ActionImpl } from '@/types/core';

import {
    BackendStoreMessage,
    BackendStorePatchMessage,
    CustomMessage,
    ProgressNotificationMessage,
    ServerErrorMessage,
    TaskStatus,
    VariableRequestMessage,
    WebSocketClientInterface,
    WebSocketMessage,
} from '../../../js/api/websocket';

// Type guard functions
function isInitMessage(message: WebSocketMessage): message is { type: 'init'; message: { channel: string } } {
    return message.type === 'init';
}

function isBackendStoreMessage(message: WebSocketMessage): message is BackendStoreMessage {
    return message.type === 'message' && 'store_uid' in (message.message as any) && 'value' in (message.message as any);
}

function isBackendStorePatchMessage(message: WebSocketMessage): message is BackendStorePatchMessage {
    return message.type === 'message' && 'store_uid' in (message.message as any) && 'patches' in (message.message as any);
}

function isCustomMessage(message: WebSocketMessage): message is CustomMessage {
    return message.type === 'custom';
}

function isVariableRequestMessage(message: WebSocketMessage): message is VariableRequestMessage {
    return message.type === 'message' && 'variable' in (message.message as any);
}

function isServerErrorMessage(message: WebSocketMessage): message is ServerErrorMessage {
    return message.type === 'message' && 'error' in (message.message as any);
}

export interface MockWebSocketClientInterface extends WebSocketClientInterface {
    receiveMessage: (message: WebSocketMessage) => void;
}

export default class MockWebSocketClient implements MockWebSocketClientInterface {
    mock_channel: string;

    messages$: Subject<WebSocketMessage>;

    constructor(mock_channel: string) {
        this.mock_channel = mock_channel;
        this.messages$ = new Subject();
    }

    actionMessages$(executionId: string): Observable<ActionImpl> {
        return this.messages$.pipe(
            filter((msg: any) => 'action' in msg.message && msg.message.uid === executionId),
            map((msg: any) => msg.message.action)
        );
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

    /**
     * Get the observable to receive the new channel when the socket reconnects
     */
    channel$(): Observable<string> {
        return this.messages$.pipe(
            filter(isInitMessage),
            map((msg) => msg.message.channel)
        );
    }

    /**
     * Get the observable to receive custom messages
     */
    customMessages$(): Observable<CustomMessage> {
        return this.messages$.pipe(filter(isCustomMessage));
    }

    getChannel(): Promise<string> {
        return Promise.resolve(this.mock_channel);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    waitForTask(task_id: string): Promise<any> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(this.messages$);
            }, 10);
        });

        // return this.messages$.toPromise();
    }

    taskStatusUpdates$(...task_ids: string[]): Observable<TaskStatus> {
        return this.messages$.pipe(
            filter((msg: any) => task_ids.includes(msg.message.task_id)),
            map((msg: any) => msg.message.status)
        );
    }

    progressUpdates$(...task_ids: string[]): Observable<ProgressNotificationMessage> {
        return this.messages$.pipe(
            filter((msg: any) => task_ids.includes(msg.message.task_id))
        ) as Observable<ProgressNotificationMessage>;
    }

    serverErrors$(): Observable<ServerErrorMessage> {
        return this.messages$.pipe(filter(isServerErrorMessage));
    }

    serverTriggers$(dataId: string): Observable<any> {
        return this.messages$.pipe(filter((msg: any) => msg.message.data_id === dataId));
    }

    /**
     * Get the observable to receive variable request messages
     */
    variableRequests$(): Observable<VariableRequestMessage> {
        return this.messages$.pipe(filter(isVariableRequestMessage));
    }

    /** Mock receiving a message */
    receiveMessage(message: WebSocketMessage): void {
        this.messages$.next(message);
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    sendCustomMessage(kind: string, data: any): Promise<CustomMessage | null> {
        // Do nothing
        return Promise.resolve(null);
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    sendMessage(value: any, channel: string, chunkCount?: number): void {
        // Do nothing
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    sendVariable(value: any, channel: string): void {
        // Do nothing
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    updateToken(newToken: string): void {
        // Do Nothing
    }

    // eslint-disable-next-line
    close(): void {
        // Do Nothing
    }
}
