import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

import { ActionImpl } from '@/types/core';
import { isActionImpl } from '@/types/utils';

import {
    CustomMessage,
    ProgressNotificationMessage,
    ServerErrorMessage,
    TaskStatus,
    VariableRequestMessage,
    WebSocketClientInterface,
    WebSocketMessage,
} from '../../../js/api/websocket';

export interface MockWebSocketClientInterface extends WebSocketClientInterface {
    getChannel: () => Promise<string>;
    progressUpdates$: (...task_ids: string[]) => Observable<ProgressNotificationMessage>;
    receiveMessage: (message: WebSocketMessage) => void;
    taskStatusUpdates$: (...task_ids: string[]) => Observable<TaskStatus>;
    variableRequests$: () => Observable<VariableRequestMessage>;
    waitForTask: (task_id: string) => Promise<any>;
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

    serverTriggers$(dataId: string): Observable<any> {
        return this.messages$.pipe(filter((msg: any) => msg.message.data_id === dataId));
    }

    /**
     * Get the observable to receive variable request messages
     */
    variableRequests$(): Observable<VariableRequestMessage> {
        return this.messages$.pipe(
            filter((msg) => !!msg?.message && 'variable' in msg.message)
        ) as Observable<VariableRequestMessage>;
    }

    /** Mock receiving a message */
    receiveMessage(message: WebSocketMessage): void {
        this.messages$.next(message);
    }
}
