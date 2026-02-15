import type { SwitchVariable } from '@/types/core';

// eslint-disable-next-line import/no-cycle
import { useConditionOrVariable, useVariable } from './internal';

export function useSwitchVariable<T>(variable: SwitchVariable<T>): any {
    // don't suspend after initial render
    const value = useConditionOrVariable(variable.value, { suspend: false });
    const [valueMap] = useVariable(variable.value_map, { suspend: false });
    const [defaultValue] = useVariable(variable.default, { suspend: false });

    // Always convert to string for consistent lookup since JS object keys are strings
    // This ensures consistent behavior between condition-based and value-based lookups
    const lookupKey = String(value);
    if (Object.prototype.hasOwnProperty.call(valueMap, lookupKey)) {
        return valueMap[lookupKey];
    }
    return defaultValue;
}
