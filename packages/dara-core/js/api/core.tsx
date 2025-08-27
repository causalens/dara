import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { handleAuthErrors } from '@/auth/auth';

import { type RequestExtras, request } from './http';

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
