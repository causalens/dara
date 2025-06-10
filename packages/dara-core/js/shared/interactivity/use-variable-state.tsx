import { useContext } from 'react';
import { useRecoilCallback } from 'recoil';

import { WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    type AnyVariable,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
} from '@/types';

import { resolveVariable } from './resolve-variable';
import { isRegistered } from './store';

type AnyResolvedVariable = ResolvedDataVariable | ResolvedDerivedDataVariable | ResolvedDerivedVariable;

/**
 * Helper hook to get the current state of the variable.
 * For client-side variables, returns their value. For server-side variables, returns their resolved forms.
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export default function useVariableState(): any | AnyResolvedVariable {
    const extras = useRequestExtras();
    const { client } = useContext(WebSocketCtx);
    const taskCtx = useTaskContext();

    return useRecoilCallback(({ snapshot }) => {
        return (variable: AnyVariable<any>) => {
            if (!isRegistered(variable)) {
                return '__NOT_REGISTERED__';
            }

            // get the resolved form of the variable
            const resolvedVariable = resolveVariable<AnyResolvedVariable>(variable, client, taskCtx, extras, (v) =>
                snapshot.getLoadable(v).getValue()
            );

            return resolvedVariable;
        };
    }, []);
}
