// /* eslint-disable react-hooks/exhaustive-deps */

// import { useCallback } from 'react';
// import { useHistory } from 'react-router-dom';

// import { useNotifications } from '@darajs/ui-notifications';
// import { Status } from '@darajs/ui-utils';

// import { resolveValue } from '@/shared/interactivity/resolve-value';
// import useVariableValue from '@/shared/interactivity/use-variable-value';
// import { normalizeRequest } from '@/shared/utils/normalization';
// import { ActionHandler, NavigateToInstance } from '@/types/core';

// /**
//  * Check whether the passed url is a valid url
//  *
//  * @param url the url to check
//  */
// function isValidHttpUrl(url: string): boolean {
//     let newUrl;

//     try {
//         newUrl = new URL(url);
//     } catch {
//         return false;
//     }

//     return newUrl.protocol === 'http:' || newUrl.protocol === 'https:';
// }

// /**
//  * Front-end handler for NavigateTo action.
//  * Navigates to a specified URL if specified, otherwise calls the backend first to retrieve the URL.
//  */
// const NavigateTo: ActionHandler<string, NavigateToInstance> = (action, { fetchAction, sessionToken }) => {
//     const history = useHistory();
//     const { pushNotification } = useNotifications();

//     // eslint-disable-next-line react-hooks/rules-of-hooks
//     const extras = action.extras?.map((variable) => useVariableValue(variable)) ?? [];

//     return useCallback(
//         async (value: any): Promise<void> => {
//             let url: string = null;
//             const resolvedExtras = extras.map((extra) => resolveValue(extra, false));
//             const normalizedExtras = normalizeRequest(resolvedExtras, action.extras);

//             try {
//                 url = action.url
//                     ? action.url
//                     : await fetchAction(action.uid, { extras: normalizedExtras, inputs: { value } });
//             } catch {
//                 // Recover from server error - notify about the action and don't do anything as we don't know where to navigate
//                 pushNotification({
//                     key: action.uid,
//                     message: 'Try again or contact the application owner',
//                     status: Status.ERROR,
//                     title: 'Error executing action',
//                 });
//                 return Promise.resolve();
//             }

//             const isValidUrl = isValidHttpUrl(url);

//             if (isValidUrl || action.new_tab) {
//                 // If the url is not valid then add the session token to it as it's an internal download request
//                 if (!isValidUrl) {
//                     url = url.includes('?')
//                         ? `${url}&session_token=${String(sessionToken)}`
//                         : `${url}?session_token=${String(sessionToken)}`;
//                 }
//                 window.open(url, action.new_tab ? '_blank' : undefined);
//             } else {
//                 history.push(url);
//             }
//         },
//         [action, sessionToken]
//     );
// };

// export default NavigateTo;
