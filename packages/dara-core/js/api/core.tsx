import { UseQueryResult, useQuery } from '@tanstack/react-query';

import { HTTP_METHOD, RequestError, validateResponse } from '@darajs/ui-utils';

import { handleAuthErrors } from '@/auth/auth';
import { useRequestExtras } from '@/shared/context';
import { denormalize } from '@/shared/utils/normalization';
import { ActionDef, Component, Config, NormalizedPayload, Template } from '@/types';

import { RequestExtras, request } from './http';

/** Api call to fetch the action registry from the backend */
export function useActions(): UseQueryResult<
    {
        [k: string]: ActionDef;
    },
    RequestError
> {
    const extras = useRequestExtras();
    return useQuery({
        queryFn: async () => {
            const res = await request('/api/core/actions', { method: HTTP_METHOD.GET }, extras);
            await handleAuthErrors(res, true);
            await validateResponse(res, 'Failed to fetch the actions for this app');
            return res.json();
        },
        queryKey: ['actions'],
        refetchOnMount: false,
    });
}

/** Api call to fetch the main configuration from the backend */
export function useConfig(): UseQueryResult<Config, RequestError> {
    const extras = useRequestExtras();

    return useQuery({
        queryFn: async () => {
            const res = await request('/api/core/config', { method: HTTP_METHOD.GET }, extras);
            await handleAuthErrors(res, true);
            await validateResponse(res, 'Failed to fetch the config for this app');
            return res.json();
        },
        queryKey: ['config'],
        refetchOnMount: false,
    });
}

/** Api call to fetch the component registry from the backend */
export function useComponents(): UseQueryResult<
    {
        [k: string]: Component;
    },
    RequestError
> {
    const extras = useRequestExtras();
    return useQuery({
        queryFn: async () => {
            const res = await request('/api/core/components', { method: HTTP_METHOD.GET }, extras);
            await handleAuthErrors(res, true);
            await validateResponse(res, 'Failed to fetch the config for this app');
            return res.json();
        },
        queryKey: ['components'],
        refetchOnMount: false,
    });
}

/**
 * Api call to fetch the template from the backend
 *
 * @param template - the template name to fetch
 */
export function useTemplate(template: string): UseQueryResult<Template, RequestError> {
    const extras = useRequestExtras();
    return useQuery({
        enabled: !!template,

        queryFn: async () => {
            const res = await request(`/api/core/template/${template}`, { method: HTTP_METHOD.GET }, extras);
            await handleAuthErrors(res, true);
            await validateResponse(res, 'Failed to fetch the template');
            const { data: normalizedTemplate, lookup } = (await res.json()) as NormalizedPayload<Template>;
            return denormalize(normalizedTemplate, lookup);
        },

        queryKey: ['template', template],
        refetchOnWindowFocus: false,
        // For now we only need to fetch the template once so treat it as if it never went out of date
        staleTime: Infinity,
    });
}

/**
 * Fetch the result of a task from the backend by it's id
 *
 * @param taskId the id of the task to fetch
 * @param token the session token to use
 */
export async function fetchTaskResult<T>(taskId: string, extras: RequestExtras): Promise<T> {
    const res = await request(`/api/core/tasks/${taskId}`, { method: HTTP_METHOD.GET }, extras);
    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to fetch the result of task with id: ${taskId}`);

    const resJson = await res.json();

    if (typeof resJson === 'object' && 'error' in resJson) {
        throw new Error(resJson.error);
    }

    return resJson;
}

/**
 * Cancel a task by it's id
 *
 * @param taskId the id of the task to fetch
 * @param token the session token to use
 */
export async function cancelTask(taskId: string, extras: RequestExtras): Promise<boolean> {
    const res = await request(`/api/core/tasks/${taskId}`, { method: HTTP_METHOD.DELETE }, extras);
    await handleAuthErrors(res, true);
    await validateResponse(res, `Failed to cancel task with id: ${taskId}`);
    return true;
}
