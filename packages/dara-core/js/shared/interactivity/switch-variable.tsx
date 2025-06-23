import type { SwitchVariable } from '@/types/core';
import { isCondition } from '@/types/utils';

import { useConditionOrVariable, useVariable } from './internal';

export function useSwitchVariable<T>(variable: SwitchVariable<T>): any {
    const value = useConditionOrVariable(variable.value);
    const [valueMap] = useVariable(variable.value_map);
    const [defaultValue] = useVariable(variable.default);

    // variable.value is condition -> value was resolved to a boolean
    if (isCondition(variable.value)) {
        return valueMap[String(value)] ?? defaultValue;
    }

    return valueMap[value] ?? defaultValue;
}
