import type { SwitchVariable } from '@/types/core';

// eslint-disable-next-line import/no-cycle
import { useConditionOrVariable, useVariable } from './internal';

export function useSwitchVariable<T>(variable: SwitchVariable<T>): any {
    const value = useConditionOrVariable(variable.value);
    const [valueMap] = useVariable(variable.value_map);
    const [defaultValue] = useVariable(variable.default);

    // Always convert to string for consistent lookup since JS object keys are strings
    // This ensures consistent behavior between condition-based and value-based lookups
    const lookupKey = String(value);
    return valueMap[lookupKey] ?? defaultValue;
}
