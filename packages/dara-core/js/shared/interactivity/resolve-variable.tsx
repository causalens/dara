import { RecoilState } from 'recoil';

import { WebSocketClientInterface } from '@/api';
import { RequestExtras } from '@/api/http';
import { GlobalTaskContext } from '@/shared/context/global-task-context';
import {
    AnyVariable,
    ResolvedDataVariable,
    ResolvedDerivedDataVariable,
    ResolvedDerivedVariable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isUrlVariable,
} from '@/types';

// eslint-disable-next-line import/no-cycle
import {
    getOrRegisterDerivedVariable,
    getOrRegisterPlainVariable,
    getOrRegisterUrlVariable,
    resolveDataVariable,
} from './internal';

/**
 * Resolve a variable to a value (for non-derived variables using provided resolver)
 * or a ResolvedDerivedVariable (if it's a derived variable).
 * Registers all encountered variables which aren't yet in registry.
 *
 * @param variable variable to resolve
 * @param client websocket client from context
 * @param taskContext global task context
 * @param extras request extras to be merged into the options
 * @param resolver function to run the value through (for non-derived variables)
 */
export function resolveVariable<VariableType>(
    variable: AnyVariable<VariableType>,
    client: WebSocketClientInterface,
    taskContext: GlobalTaskContext,
    extras: RequestExtras,
    resolver: (val: RecoilState<VariableType>) => RecoilState<VariableType> | ResolvedDerivedVariable | VariableType = (
        val: RecoilState<VariableType>
    ) => val
):
    | RecoilState<VariableType>
    | ResolvedDerivedVariable
    | ResolvedDerivedDataVariable
    | ResolvedDataVariable
    | VariableType {
    if (isDerivedVariable(variable) || isDerivedDataVariable(variable)) {
        getOrRegisterDerivedVariable(variable, client, taskContext, extras);

        // For derived variable, recursively resolve the dependencies
        const values = variable.variables.map((v) => resolveVariable(v, client, taskContext, extras, resolver));

        // Store indexes of values which are in deps
        const deps = variable.deps.map((dep) => variable.variables.findIndex((v) => v.uid === dep.uid));

        if (isDerivedDataVariable(variable)) {
            return {
                deps,
                filters: variable.filters,
                type: 'derived-data',
                uid: variable.uid,
                values,
            } as ResolvedDerivedDataVariable;
        }

        return {
            deps,
            type: 'derived',
            uid: variable.uid,
            values,
        } as ResolvedDerivedVariable;
    }

    if (isDataVariable(variable)) {
        return resolveDataVariable(variable);
    }

    if (isUrlVariable(variable)) {
        return resolver(getOrRegisterUrlVariable(variable));
    }

    return resolver(getOrRegisterPlainVariable(variable, client, taskContext, extras));
}
