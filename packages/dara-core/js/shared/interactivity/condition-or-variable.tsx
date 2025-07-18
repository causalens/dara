import type { Condition, Variable } from '@/types/core';
import { isCondition } from '@/types/utils';

import { isConditionTrue } from './condition';
// eslint-disable-next-line import/no-cycle
import { type UseVariableOptions, useVariable } from './use-variable';

/* eslint-disable react-hooks/rules-of-hooks */
export function useConditionOrVariable<T>(arg: Variable<T> | Condition<T> | T, opts: UseVariableOptions = {}): T {
    // Note we assume arg never changes from a condition to a variable so we can use hooks conditionally
    if (isCondition(arg)) {
        const value = useVariable(arg.variable, opts)[0];
        const other = useVariable(arg.other, opts)[0];
        return isConditionTrue(arg.operator, value, other) as T;
    }
    return useVariable(arg, opts)[0];
}
