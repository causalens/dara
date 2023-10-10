import { getAtom } from '@/shared/interactivity';
import { ActionHandler, UpdateVariableImpl } from '@/types/core';

/**
 * Front-end handler for UpdateVariable action.
 */
const UpdateVariable: ActionHandler<UpdateVariableImpl> = async (ctx, actionImpl): Promise<void> => {
    return ctx.set(getAtom(actionImpl.target), actionImpl.value);
};

export default UpdateVariable;
