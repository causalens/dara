/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback } from 'react';

import { useNotifications } from '@darajs/ui-notifications';
import { Status } from '@darajs/ui-utils';

import { resolveValue, useVariableValue } from '@/shared/interactivity';
import { normalizeRequest } from '@/shared/utils/normalization';
import { ActionHook, SideEffectInstance } from '@/types/core';

/**
 * Front-end handler for SideEffect action.
 * Calls the backend to execute an arbitrary function.
 */
const SideEffect: ActionHook<void, SideEffectInstance> = (action, { fetchAction }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const extras = action.extras?.map((variable) => useVariableValue(variable)) ?? [];
    const { pushNotification } = useNotifications();

    return useCallback(
        async (value: any): Promise<void> => {
            const resolvedExtras = extras.map((extra) => resolveValue(extra, false));
            const normalizedExtras = normalizeRequest(resolvedExtras, action.extras);

            const resultPromise = fetchAction(action.uid, { extras: normalizedExtras, inputs: { value } }).catch(() => {
                // Recover from server error - notify about the error
                pushNotification({
                    key: action.uid,
                    message: 'Try again or contact the application owner',
                    status: Status.ERROR,
                    title: 'Error executing action',
                });
            });

            // only wait for side effect to complete if block flag is set
            if (action.block) {
                await resultPromise;
            }

            return Promise.resolve();
        },
        [action]
    );
};

export default SideEffect;
