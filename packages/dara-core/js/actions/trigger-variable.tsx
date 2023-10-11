// import { useCallback } from 'react';

import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { ActionHandler, TriggerVariableImpl } from '@/types/core';

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

const TriggerVariable: ActionHandler<TriggerVariableImpl> = (ctx, actionImpl): void => {
    console.log(actionImpl);

    const triggerAtom = getOrRegisterTrigger(actionImpl.variable);
    console.log(triggerAtom);

    ctx.set(triggerAtom, (triggerIndexValue) => ({
        force: actionImpl.force,
        inc: triggerIndexValue.inc + 1,
    }));
};

export default TriggerVariable;
