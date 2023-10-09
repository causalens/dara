// /* eslint-disable import/prefer-default-export */
// /* eslint-disable react-hooks/exhaustive-deps */

// import { useCallback, useContext } from 'react';
// import { CallbackInterface } from 'recoil';

// import { HTTP_METHOD, validateResponse } from '@darajs/ui-utils';

// import { request } from '@/api/http';
// import { useSessionToken } from '@/auth/auth-context';
// import { WebSocketCtx } from '@/shared/context';
// import { ActionContext } from '@/types/core';

// /**
//  * Helper hook that exposes an action context object with:
//  * - a function to fetch the derived parameter for an action from the backend
//  * - the session token
//  * - the websocket client instance
//  */
// export function useActionContext<T>(): Omit<ActionContext, keyof CallbackInterface> {
//     const { client: wsClient } = useContext(WebSocketCtx);
//     const token = useSessionToken();

//     return {
//         sessionToken: token,
//         wsClient,
//     };
// }
