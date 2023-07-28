import { useCallback } from 'react';

import { useResetVariables } from '@/shared/interactivity';
import { ActionHook, ResetVariablesInstance } from '@/types/core';

/**
 * Front-end handler for ResetVariables action.
 * Sequentially resets variables to their default values (or forces a recalculation for DerivedVariables)
 */
const ResetVariables: ActionHook<never, ResetVariablesInstance> = (action) => {
    const reset = useResetVariables(action.variables);
    return useCallback(async () => {
        reset();
        return Promise.resolve();
    }, [reset]);
};

export default ResetVariables;
