/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback } from 'react';

import { useNotifications } from '@darajs/ui-notifications';
import { Status } from '@darajs/ui-utils';

import { fetchTaskResult } from '@/api';
import { useTaskContext } from '@/shared/context';
import { useVariable, useVariableValue } from '@/shared/interactivity';
import { resolveValue } from '@/shared/interactivity/resolve-value';
import { normalizeRequest } from '@/shared/utils/normalization';
import { isDataVariable } from '@/types';
import { ActionHook, UpdateVariableInstance } from '@/types/core';

/**
 * Front-end handler for UpdateVariable action.
 * Calls the backend to calculate a new value for a variable based on the value passed into the action and optional
 * extra variables. Then updates the value stored on the frontend with the value returned by the backend.
 */
const UpdateVariable: ActionHook<any, UpdateVariableInstance> = (action, { fetchAction, wsClient, sessionToken }) => {
    const taskContext = useTaskContext();
    const { pushNotification } = useNotifications();

    let previousVariableValue: any = null;
    let setUpdateVar: (val: any) => void = null;

    // Do not call useVariable on a DateVariable as it will fetch its whole value
    // we also don't need the setter as it's purely server-side
    if (!isDataVariable(action.variable)) {
        [previousVariableValue, setUpdateVar] = useVariable(action.variable);
    }

    const updateVar = useVariableValue(action.variable);
    const extras = action.extras?.map((variable) => useVariableValue(variable)) ?? [];

    return useCallback(
        async (value: any): Promise<void> => {
            const resolvedExtras = extras.map((extra) => resolveValue(extra, false));
            const normalizedExtras = normalizeRequest(resolvedExtras, action.extras);

            let variableValue = null;

            try {
                variableValue = await fetchAction(action.uid, {
                    extras: normalizedExtras,
                    inputs: {
                        new: value,
                        old: resolveValue(updateVar, false),
                    },
                });
            } catch {
                // Recover from server error - notify about the error and keep previous variable value
                pushNotification({
                    key: action.uid,
                    message: 'Try again or contact the application owner',
                    status: Status.ERROR,
                    title: 'Error executing action',
                });
                return previousVariableValue;
            }

            // If variableValue is a MetaTask, wait for its result
            if (variableValue?.task_id !== undefined) {
                // Add it to list of running tasks so i.e. it can be cancelled; we don't check if there's a task running
                // already because it's a MetaTask specifically created for this action
                const taskId = variableValue.task_id;

                // add task to currently running tasks
                taskContext.startTask(taskId);

                await wsClient.waitForTask(taskId);

                // remove it once it's finished
                taskContext.endTask(taskId);

                try {
                    variableValue = await fetchTaskResult(taskId, sessionToken);
                } catch {
                    // Recover from task server error - notify about the error and keep previous variable value
                    pushNotification({
                        key: action.uid,
                        message: 'Try again or contact the application owner',
                        status: Status.ERROR,
                        title: 'Error executing action',
                    });
                    return previousVariableValue;
                }
            }

            setUpdateVar?.(variableValue);
        },
        [action, setUpdateVar, sessionToken]
    );
};

export default UpdateVariable;
