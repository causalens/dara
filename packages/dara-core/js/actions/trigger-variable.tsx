import { nanoid } from 'nanoid';

import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { type ActionHandler, type TriggerVariableImpl } from '@/types/core';

/**
 * Front-end handler for TriggerVariable action.
 * Forces the recalculation of a particular DerivedVariable.
 */
const TriggerVariable: ActionHandler<TriggerVariableImpl> = (ctx, actionImpl): void => {
    const triggerAtom = getOrRegisterTrigger(actionImpl.variable);

    ctx.set(triggerAtom, (triggerIndexValue) => ({
        inc: triggerIndexValue.inc + 1,
        force_key: actionImpl.force ? nanoid() : null,
    }));
};

export default TriggerVariable;
