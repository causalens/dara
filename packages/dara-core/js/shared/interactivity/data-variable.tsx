/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback, useRef } from 'react';
import { atom } from 'recoil';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { WebSocketClientInterface, fetchTaskResult, handleAuthErrors } from '@/api';
import { RequestExtras, request } from '@/api/http';
import { GlobalTaskContext } from '@/shared/context/global-task-context';
import { DataFrame, DataVariable, DerivedDataVariable, FilterQuery, Pagination, ResolvedDataVariable } from '@/types';

import { useRequestExtras } from '../context';
import { combineFilters } from './filtering';
// eslint-disable-next-line import/no-cycle
import { DerivedVariableValueResponse } from './internal';
import { atomRegistry } from './store';

/**
 * Format a DataVariable into a ResolvedDataVariable structure for the backend
 *
 * @param variable the variable to resolve for the backend
 */
export function resolveDataVariable(variable: DataVariable): ResolvedDataVariable {
    return {
        filters: variable.filters,
        type: 'data',
        uid: variable.uid,
    };
}

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

/**
 * Retrieve the value of a data variable from the backend
 *
 * @param uid
 * @param extras request extras to be merged into the options
 * @param filters
 * @param pagination
 */
export async function fetchDataVariable(
    uid: string,
    extras: RequestExtras,
    filters?: FilterQuery,
    pagination?: Pagination
): Promise<DataFrame> {
    const url = createDataUrl(`/api/core/data-variable/${uid}`, pagination);

    const response = await request(url, { body: JSON.stringify({ filters }), method: HTTP_METHOD.POST }, extras);
    await handleAuthErrors(response, true);
    await validateResponse(response, 'Failed to fetch data variable');
    return response.json();
}

interface TaskResponse {
    task_id: string;
}

export interface DataResponse {
    data: DataFrame | null;
    totalCount: number;
}

export function isDataResponse(response: any): response is DataResponse {
    return typeof response === 'object' && 'data' in response && 'totalCount' in response;
}

/**
 * Retrieve the value of a derived data variable from the backend
 *
 * @param uid
 * @param extras request extras to be merged into the options
 * @param filters
 * @param pagination
 * @param cacheKey - cache key of the underlying DV, required for DerivedDataVariables
 * @param wsChannel - websocket channel, required for DerivedDataVariables
 */
export async function fetchDerivedDataVariable(
    uid: string,
    extras: RequestExtras,
    cacheKey: string,
    wsChannel: string,
    filters?: FilterQuery,
    pagination?: Pagination
): Promise<DataFrame | TaskResponse | null> {
    const url = createDataUrl(`/api/core/data-variable/${uid}`, pagination);
    const response = await request(
        url,
        { body: JSON.stringify({ cache_key: cacheKey, filters, ws_channel: wsChannel }), method: HTTP_METHOD.POST },
        extras
    );
    await handleAuthErrors(response, true);
    await validateResponse(response, 'Failed to fetch data variable');
    return response.json();
}

/**
 * Get total count of data in a data variable
 *
 * @param uid uid of the variable
 * @param extras request extras to be merged into the options
 * @param cacheKey cache key of the underlying DV in the case of derived data variables
 */
async function fetchDataVariableCount(
    uid: string,
    extras: RequestExtras,
    filters?: FilterQuery,
    cacheKey?: string
): Promise<number> {
    const response = await request(
        `/api/core/data-variable/${uid}/count`,
        { body: JSON.stringify({ cache_key: cacheKey, filters }), method: HTTP_METHOD.POST },
        extras
    );
    await handleAuthErrors(response, true);
    await validateResponse(response, 'Failed to fetch data variable total count');
    return response.json();
}

/**
 * Get a callback to fetch data variable from the backend
 *
 * @param variable variable instance
 * @param serverTriggerCounter a counter to force recreation of the callback
 */
export function useFetchDataVariable(
    variable: DataVariable,
    serverTriggerCounter: number
): (filters?: FilterQuery, pagination?: Pagination) => Promise<DataResponse> {
    const extras = useRequestExtras();

    const dataCallback = useCallback(
        async (filters?: FilterQuery, pagination?: Pagination) => {
            const mergedFilters = combineFilters('AND', [variable.filters, filters]);

            const data = await fetchDataVariable(variable.uid, extras, mergedFilters, pagination);

            const totalCount = await fetchDataVariableCount(variable.uid, extras, mergedFilters);

            return {
                data,
                totalCount,
            };
        },
        [variable, extras, serverTriggerCounter]
    );

    return dataCallback;
}

/**
 * Get a callback to fetch derived data variable from the backend.
 * Throws a TaskCancelledError when the backend task is cancelled.
 *
 * @param variable variable instance
 * @param taskContext global task context
 * @param wsClient websocket client instance
 * @param dvValuePromise promise representing underlying derived variable state
 */
export function useFetchDerivedDataVariable(
    variable: DerivedDataVariable,
    taskContext: GlobalTaskContext,
    wsClient: WebSocketClientInterface,
    dvValuePromise: Promise<DerivedVariableValueResponse<any>>
): (filters?: FilterQuery, pagination?: Pagination) => Promise<DataResponse> {
    const extras = useRequestExtras();
    const previousResult = useRef<DataResponse>({ data: null, totalCount: 0 });
    const dataCallback = useCallback(
        async (filters?: FilterQuery, pagination?: Pagination) => {
            const mergedFilters = combineFilters('AND', [variable.filters, filters]);
            const dvValue = await dvValuePromise;

            const response = await fetchDerivedDataVariable(
                variable.uid,
                extras,
                dvValue.cache_key,
                await wsClient.getChannel(),
                mergedFilters,
                pagination
            );

            let data = null;

            const variableTaskId = `${variable.uid}-filter`;

            // cancel previously running filter tasks
            taskContext.cleanupRunningTasks(variableTaskId);

            // if task was returned, wait for it to complete and fetch task result
            if (response && 'task_id' in response) {
                const taskId = response.task_id;

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

                data = await fetchTaskResult<DataFrame>(taskId, extras);
            } else {
                // otherwise use response directly
                data = response as DataFrame | null;
            }

            // For derived data variables count can only be fetched when task is not running so we have to make the request here
            // As the total count could have changed because of the underlying DV changing
            const totalCount = await fetchDataVariableCount(variable.uid, extras, mergedFilters, dvValue.cache_key);

            previousResult.current = { data, totalCount };

            return {
                data,
                totalCount,
            };
        },
        [variable, extras, dvValuePromise]
    );

    return dataCallback;
}

/**
 * Register an empty atom for DataVariable.
 * Used to check whether a variable is registered within the app.
 *
 * @param variable variable to register
 */
export function registerDataVariable(variable: DataVariable): void {
    if (!atomRegistry.has(variable.uid)) {
        atomRegistry.set(variable.uid, atom({ default: true, key: variable.uid }));
    }
}
