import { getOrRegisterTrigger } from '@/shared/interactivity/triggers';
import { type ActionHandler, type TriggerVariableImpl } from '@/types/core';

/**
 * Front-end handler for TriggerVariable action.
 * Forces the recalculation of a particular DerivedVariable.
 */
const TriggerVariable: ActionHandler<TriggerVariableImpl> = (ctx, actionImpl): void => {
    const triggerAtom = getOrRegisterTrigger(actionImpl.variable);

    ctx.set(triggerAtom, (triggerIndexValue) => ({
        force: actionImpl.force,
        inc: triggerIndexValue.inc + 1,
    }));
};

export default TriggerVariable;
