import { useContext } from 'react';
import { useRecoilCallback } from 'recoil';

import { WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import {
    AnyVariable,
    ResolvedDataVariable,
    ResolvedDerivedDataVariable,
    ResolvedDerivedVariable,
    isVariable,
} from '@/types';

import { resolveVariable } from './resolve-variable';
import { atomRegistry, isRegistered } from './store';

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

            // For variables and url-variables, get the value directly out of recoil store
            if (isVariable(variable) && (variable.__typename === 'Variable' || variable.__typename === 'UrlVariable')) {
                const atom = atomRegistry.get(variable.uid);
                return snapshot.getLoadable(atom).getValue();
            }

            // otherwise we'll just get the resolved form of the variable
            const resolvedVariable = resolveVariable<AnyResolvedVariable>(variable, client, taskCtx, extras, (v) =>
                snapshot.getLoadable(v).getValue()
            );

            return resolvedVariable;
        };
    }, []);
}
