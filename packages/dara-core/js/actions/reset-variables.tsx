// import { useCallback } from 'react';

// import { useResetVariables } from '@/shared/interactivity';
// import { ActionHandler, ResetVariablesInstance } from '@/types/core';

// /**
//  * Front-end handler for ResetVariables action.
//  * Sequentially resets variables to their default values (or forces a recalculation for DerivedVariables)
//  */
// const ResetVariables: ActionHandler<never, ResetVariablesInstance> = (action) => {
//     const reset = useResetVariables(action.variables);
//     return useCallback(async () => {
//         reset();
//         return Promise.resolve();
//     }, [reset]);
// };

// export default ResetVariables;
