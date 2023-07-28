/* eslint-disable react-hooks/rules-of-hooks */

import { useCallback } from 'react';

import { useNotifications } from '@darajs/ui-notifications';
import { Status } from '@darajs/ui-utils';

import { useVariableValue } from '@/shared/interactivity';
import { resolveValue } from '@/shared/interactivity/resolve-value';
import { normalizeRequest } from '@/shared/utils/normalization';
import { ActionHook, DownloadContentInstance } from '@/types/core';

/**
 * Frontend handler for DownloadContent action
 * Retrieves the download code and opens a new window for the content to be downloaded
 */
const DownloadContent: ActionHook<string, DownloadContentInstance> = (action, { fetchAction }) => {
    const extras = action.extras?.map((variable) => useVariableValue(variable)) ?? [];
    const { pushNotification } = useNotifications();

    return useCallback(async (value: any) => {
        const resolvedExtras = extras.map((extra) => resolveValue(extra, false));
        const normalizedExtras = normalizeRequest(resolvedExtras, action.extras);

        try {
            // First, fetch one-time download code
            const downloadCode = await fetchAction(action.uid, { extras: normalizedExtras, inputs: { value } });

            // Open download url in new tab
            window.open(`/api/core/download?code=${downloadCode}`, '_blank');
        } catch {
            // Recover from server error - notify
            pushNotification({
                key: action.uid,
                message: 'Try again or contact the application owner',
                status: Status.ERROR,
                title: 'Error downloading content',
            });
        }
    }, []);
};

export default DownloadContent;
