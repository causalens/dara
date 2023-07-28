import { useContext } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useRecoilCallback } from 'recoil';

// eslint-disable-next-line import/no-cycle
import { useSessionToken } from '@/auth/auth-context';
import { WebSocketCtx, useTaskContext } from '@/shared/context';
import { Variable, isDataVariable, isDerivedDataVariable, isDerivedVariable, isUrlVariable, isVariable } from '@/types';

import { getOrRegisterPlainVariable, getOrRegisterTrigger, getOrRegisterUrlVariable } from './internal';

/**
 * A helper hook that returns a function to reset a list of variables to their default values
 *
 * @param variables list of variables to reset
 */
export default function useResetVariables(variables: Variable<any>[]): () => void {
    const taskContext = useTaskContext();
    const { client } = useContext(WebSocketCtx);
    const { search } = useLocation();
    const token = useSessionToken();
    const history = useHistory();

    return useRecoilCallback(
        ({ reset, set }) =>
            () => {
                variables.filter(isVariable).forEach((variable) => {
                    // For DVs, trigger their recalculation
                    if (isDerivedVariable(variable) || isDerivedDataVariable(variable)) {
                        const triggerAtom = getOrRegisterTrigger(variable);

                        set(triggerAtom, (triggerIndexValue) => ({
                            force: true,
                            inc: triggerIndexValue.inc + 1,
                        }));
                    } else if (isUrlVariable(variable)) {
                        // For UrlVariables, we use set instead of reset to update the URL as well; otherwise just the atom is reset
                        const urlAtom = getOrRegisterUrlVariable(variable);
                        set(urlAtom, variable.default);
                    } else if (isDataVariable(variable)) {
                        // for data variables this is a noop
                    } else {
                        // For plain variables reset them to default values
                        const plainAtom = getOrRegisterPlainVariable(variable, client, taskContext, search, token);
                        reset(plainAtom);
                    }
                });
            },
        [variables, history]
    );
}
