// import { useCallback } from 'react';

// import { useTriggerVariable } from '@/shared/interactivity';
// import { ActionHandler, TriggerVariableInstance } from '@/types/core';

// /**
//  * Front-end handler for TriggerVariable action.
//  * Forces the recalculation of a particular DerivedVariable.
//  */
// const TriggerVariable: ActionHandler<never, TriggerVariableInstance> = (action) => {
//     // Use force flag based on setting on the Python side in the action def
//     const trigger = useTriggerVariable(action.variable, action.force);
//     return useCallback(async () => {
//         trigger();
//         return Promise.resolve();
//     }, [trigger]);
// };

// export default TriggerVariable;
