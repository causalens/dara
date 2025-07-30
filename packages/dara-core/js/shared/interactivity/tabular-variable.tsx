import { useCallback, useRef } from 'react';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { type WebSocketClientInterface, fetchTaskResult } from '@/api';
import { type RequestExtras, request } from '@/api/http';
import { handleAuthErrors } from '@/auth/auth';
import {
    type DataFrame,
    type DerivedVariable,
    type FilterQuery,
    type GlobalTaskContext,
    type NormalizedPayload,
    type Pagination,
    type ServerVariable,
} from '@/types';

import { normalizeRequest } from '../utils/normalization';
// eslint-disable-next-line import/no-cycle
import { type DerivedResult, cleanArgs } from './internal';

/**
 * Create necessary query parameters on a URL based on pagination settings
 *
 * @param path url path
 * @param pagination pagination object
 */
function createDataUrl(path: string, pagination?: Pagination): URL {
    const url = new URL(path, window.location.origin);

    if (pagination?.limit) {
        url.searchParams.set('limit', String(pagination.limit));
    }

    if (pagination?.offset) {
        url.searchParams.set('offset', String(pagination.offset));
    }

    if (pagination?.sort) {
        url.searchParams.set('order_by', (pagination.sort.desc ? '-' : '') + pagination.sort.id);
    }

    if (pagination?.index) {
        url.searchParams.set('index', String(pagination.index));
    }

    return url;
}

interface TaskResponse {
    task_id: string;
}

export interface DataResponse {
    data: DataFrame | null;
    count: number;
    schema: DataFrameSchema | null;
}

type FieldType = {
    name: string | string[]; // Multiindex columns are represented as an array of strings
    // See https://pandas.pydata.org/docs/user_guide/io.html#table-schema
    type: 'integer' | 'number' | 'boolean' | 'datetime' | 'duration' | 'any' | 'str';
};

type DataFrameSchema = {
    fields: FieldType[];
    primaryKey: string[];
};

export function isDataResponse(response: any): response is DataResponse {
    return response && typeof response === 'object' && 'data' in response && 'count' in response;
}

export type DataFetcher = (filters?: FilterQuery, pagination?: Pagination) => Promise<DataResponse>;

type TabularDataRequestBody =
    | {
          filters: FilterQuery | null;
          ws_channel: string;
          dv_values: NormalizedPayload<Record<string, any>>;
          force_key: string | null;
      }
    | {
          filters: FilterQuery | null;
          ws_channel: string;
      };

export function useFetchTabularServerVariable(
    variable: ServerVariable,
    seqNumber: number,
    wsClient: WebSocketClientInterface,
    extras: RequestExtras
): DataFetcher {
    return useCallback<DataFetcher>(
        async (filters, pagination) => {
            const url = createDataUrl(`/api/core/tabular-variable/${variable.uid}`, pagination);
            const body = {
                filters: filters ?? null,
                ws_channel: await wsClient.getChannel(),
            } satisfies TabularDataRequestBody;
            const response = await request(url, { body: JSON.stringify(body), method: HTTP_METHOD.POST }, extras);
            await handleAuthErrors(response, true);
            await validateResponse(response, 'Failed to fetch tabular data');
            return response.json();
        },
        // TODO: somehow make seqNumber not raise
        [wsClient, variable.uid, seqNumber, extras]
    );
}

export function useFetchTabularDerivedVariable(
    variable: DerivedVariable,
    dvResult: DerivedResult,
    wsClient: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras
): DataFetcher {
    const previousResult = useRef<DataResponse>({
        data: null,
        count: 0,
        schema: { fields: [], primaryKey: [] },
    });

    return useCallback<DataFetcher>(
        async (filters, pagination) => {
            const url = createDataUrl(`/api/core/tabular-variable/${variable.uid}`, pagination);
            const body = {
                filters: filters ?? null,
                ws_channel: await wsClient.getChannel(),
                dv_values: normalizeRequest(cleanArgs(dvResult.values), variable.variables),
            } satisfies TabularDataRequestBody;
            const response = await request(url, { body: JSON.stringify(body), method: HTTP_METHOD.POST }, extras);
            await handleAuthErrors(response, true);
            await validateResponse(response, 'Failed to fetch tabular data');
            const responseJson: TaskResponse | DataResponse = await response.json();

            const variableTaskId = `${variable.uid}-filter`;

            // cancel previously running filter tasks
            taskContext.cleanupRunningTasks(variableTaskId);

            // normal data response
            if (!('task_id' in responseJson)) {
                previousResult.current = responseJson;
                return responseJson;
            }

            // Task response found, wait and fetch result
            const taskId = responseJson.task_id;

            // add task to currently running tasks
            taskContext.startTask(taskId, variableTaskId);

            try {
                await wsClient.waitForTask(taskId);
            } catch {
                // If an error occurred (i.e. task was cancelled) return the previous result.
                // This would also cause the callback's identity to change so if the consuming component is
                // honouring the contract, it should execute the callback again
                return previousResult.current;
            } finally {
                taskContext.endTask(taskId);
            }

            const taskResult = await fetchTaskResult<DataResponse>(taskId, extras);
            previousResult.current = taskResult;
            return taskResult;
        },
        [variable.uid, dvResult, wsClient, taskContext, extras]
    );
}
