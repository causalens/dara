// /* eslint-disable react-hooks/rules-of-hooks */
// /* eslint-disable react-hooks/exhaustive-deps */

// import { useCallback } from 'react';

// import { useNotifications } from '@darajs/ui-notifications';

// import { ActionHandler, NotifyInstance } from '@/types/core';

// /**
//  * Frontend handler for Notify action
//  * Pushes a notification with the data given in the action
//  */
// const Notify: ActionHandler<never, NotifyInstance> = (action) => {
//     const { pushNotification } = useNotifications();

//     return useCallback(
//         (): Promise<void> =>
//             new Promise((resolve) => {
//                 pushNotification(action);
//                 resolve();
//             }),
//         [action]
//     );
// };

// export default Notify;
