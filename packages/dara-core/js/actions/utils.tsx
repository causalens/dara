/* eslint-disable import/prefer-default-export */
import { useCallback, useContext } from 'react';

import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

import { request } from '@/api/http';
import { useSessionToken } from '@/auth/auth-context';
import { WebSocketCtx } from '@/shared/context';
import { ActionContext } from '@/types/core';

/**
 * Helper hook that exposes an action context object with:
 * - a function to fetch the derived parameter for an action from the backend
 * - the session token
 * - the websocket client instance
 */
export function useActionContext<T>(): ActionContext<T> {
    const { client: wsClient } = useContext(WebSocketCtx);
    const token = useSessionToken();

    const fetchAction = useCallback(async (uid: string, body: { [k: string]: any }): Promise<T> => {
        const ws_channel = await wsClient.getChannel();
        const res = await request(
            `/api/core/action/${uid}`,
            { body: JSON.stringify({ ...body, ws_channel }), method: HTTP_METHOD.POST },
            token
        );

        await validateResponse(res, `Failed to fetch the derived action value with uid: ${uid}`);

        return res.json();
    }, []);

    return {
        fetchAction,
        sessionToken: token,
        wsClient,
    };
}
