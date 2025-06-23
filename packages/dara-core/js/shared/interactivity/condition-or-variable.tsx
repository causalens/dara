import type { Condition, Variable } from '@/types/core';
import { isCondition } from '@/types/utils';

import { isConditionTrue } from './condition';
import { useVariable } from './use-variable';

/* eslint-disable react-hooks/rules-of-hooks */
export function useConditionOrVariable<T>(arg: Variable<T> | Condition<T> | T): T {
    // Note we assume arge never changes from a condition to a variable so we can use hooks conditionally
    if (isCondition(arg)) {
        const value = useVariable(arg.variable)[0];
        const other = useVariable(arg.other)[0];
        return isConditionTrue(arg.operator, value, other) as T;
    }
    return useVariable(arg)[0];
}
