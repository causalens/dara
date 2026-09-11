import { type ActionHandler, type ActionImpl, type SingleVariable } from '@darajs/core';
import UpdateVariable from '@darajs/core/actions/update-variable';

interface IncrementImpl extends ActionImpl {
    variable: SingleVariable<number>;
}

/** A local action can compose a built-in implementation while keeping its existing runtime name. */
const increment: ActionHandler<IncrementImpl> = async (context, action) => {
    await UpdateVariable(context, {
        __typename: 'ActionImpl',
        name: 'UpdateVariable',
        variable: action.variable,
        value: context.input,
    });
};

export default increment;
