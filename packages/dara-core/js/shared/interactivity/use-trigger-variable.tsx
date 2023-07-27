import { useRecoilCallback } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { DerivedDataVariable, DerivedVariable } from '@/types';

import { getOrRegisterTrigger } from './internal';

/**
 * A helper hook that returns a function to trigger a calculation for a given variable.
 *
 * @param variable variable to use
 * @param force whether to force the recalculation irrespective of the caching setting
 */
export default function useTriggerVariable(
    variable: DerivedVariable | DerivedDataVariable,
    force: boolean
): () => void {
    return useRecoilCallback(
        ({ set }) =>
            () => {
                const triggerAtom = getOrRegisterTrigger(variable);

                set(triggerAtom, (triggerIndexValue) => ({
                    force,
                    inc: triggerIndexValue.inc + 1,
                }));
            },
        [variable.uid, force]
    );
}
