// /* eslint-disable react-hooks/exhaustive-deps */

// import { useCallback } from 'react';
// import { useHistory } from 'react-router-dom';

// import { ActionHandler, LogoutInstance } from '@/types/core';

// /**
//  * Front-end handler for Logout action.
//  * Navigates to '/logout'.
//  */
// const Logout: ActionHandler<never, LogoutInstance> = () => {
//     const history = useHistory();

//     return useCallback(async (): Promise<void> => {
//         history.push('/logout');
//         return Promise.resolve();
//     }, []);
// };

// export default Logout;
