/* eslint-disable react-hooks/rules-of-hooks */
import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { useRecoilCallback } from 'recoil';

import { useDeepCompare } from '@darajs/ui-utils';

// eslint-disable-next-line import/no-cycle
import { useSessionToken } from '@/auth/auth-context';
import { WebSocketCtx, useTaskContext } from '@/shared/context';
import { normalizeRequest } from '@/shared/utils/normalization';
import {
    DataVariable,
    DerivedDataVariable,
    DerivedVariable,
    ResolvedDataVariable,
    ResolvedDerivedDataVariable,
    ResolvedDerivedVariable,
    Variable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isResolvedDataVariable,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
    isVariable,
} from '@/types';

import {
    fetchDataVariable,
    fetchDerivedDataVariable,
    fetchDerivedVariable,
    formatDerivedVariableRequest,
    isTaskResponse,
    resolveVariable,
} from './internal';

type UseVariableValueSigOne<V, B extends boolean | undefined> = (
    variable: DerivedVariable,
    shouldFetchVariable?: B
) => () => B extends true ? Promise<V> : ResolvedDerivedVariable;

type UseVariableValueSigTwo<V, B extends boolean | undefined> = (
    variable: DataVariable,
    shouldFetchVariable?: B
) => () => B extends true ? Promise<V> : ResolvedDataVariable;

type UseVariableValueSigThree<V, B extends boolean | undefined> = (
    variable: V | Variable<V>,
    shouldFetchVariable?: B
) => () => V;
type UseVariableValueSigFour<V, B extends boolean | undefined> = (
    variable: DerivedDataVariable,
    shouldFetchVariable?: B
) => () => B extends true ? Promise<V> : ResolvedDerivedDataVariable;
type UseVariableValueSig<V, B extends boolean | undefined> =
    | UseVariableValueSigOne<V, B>
    | UseVariableValueSigTwo<V, B>
    | UseVariableValueSigThree<V, B>
    | UseVariableValueSigFour<V, B>;

/**
 * A helper hook that turns a Variable class into the actual value.
 * As opposed to the `useVariable` hook, this one returns a callback to retrieve the latest value
 * without subscribing the component using it to updates.
 * For derived (data) variables, instead of returning its value directly - its resolved to its
 * uid and dependency values.
 *
 * @param variable the variable to use
 * @param shouldFetchVariable if true, if the variable is a derived (data) variable, the request to fetch the variable value will be made
 * @returns Returns the value if the Variable is not derived/data. A Resolved(Data/Derived/DerivedData)Variable if shouldFetchVariable = false, and a Promise for fetching the variable if true.
 */
export default function useVariableValue<VV, B extends boolean = false>(
    variable: VV | Variable<VV> | DataVariable | DerivedVariable | DerivedDataVariable,
    shouldFetchVariable: B = false as B
): ReturnType<UseVariableValueSig<VV, B>> {
    const taskContext = useTaskContext();
    const { client } = useContext(WebSocketCtx);
    const { search } = useLocation();
    const token = useSessionToken();

    if (!isVariable<VV>(variable)) {
        return () => variable;
    }

    return useRecoilCallback(
        ({ snapshot }) => {
            return () => {
                // Using loadable since the resolver is only used for simple atoms and shouldn't cause problems
                const resolved = resolveVariable<any>(variable, client, taskContext, search, token, (v) =>
                    snapshot.getLoadable(v).getValue()
                );

                // if we're NOT forced to fetch, or if it's not a DV/DDV/data variable, return the resolved value
                // variable is plain/url
                if (
                    !shouldFetchVariable ||
                    (!isDerivedVariable(variable) && !isDataVariable(variable) && !isDerivedDataVariable(variable))
                ) {
                    return resolved;
                }

                // we're forced to fetch but the resolved variable is not a resolved DV/data var, return the resolved value
                // variable is plain/url
                if (
                    !isResolvedDerivedVariable(resolved) &&
                    !isResolvedDataVariable(resolved) &&
                    !isResolvedDerivedDataVariable(resolved)
                ) {
                    return resolved;
                }

                // data variable
                if (isResolvedDataVariable(resolved)) {
                    return fetchDataVariable(resolved.uid, token, resolved.filters);
                }

                // derived variable
                return fetchDerivedVariable({
                    cache: (variable as DerivedVariable | DerivedDataVariable).cache,
                    force: false,
                    token,
                    uid: resolved.uid,
                    values: normalizeRequest(
                        formatDerivedVariableRequest(resolved.values),
                        (variable as DerivedVariable | DerivedDataVariable).variables
                    ),
                    wsClient: client,
                }).then((resp) => {
                    // This is really only used in DownloadVariable currently; we can add support for tasks
                    // if it is requested in the future
                    if (isTaskResponse(resp)) {
                        throw new Error('Task DerivedVariables are not supported in this context');
                    }

                    // for derived data variables we need to make another request to retrieve the filtered value
                    if (isDerivedDataVariable(variable)) {
                        return client
                            .getChannel()
                            .then((chan) =>
                                fetchDerivedDataVariable(variable.uid, token, resp.cache_key, chan, variable.filters)
                            );
                    }

                    return resp.value;
                });
            };
        },
        [variable.uid, useDeepCompare(taskContext), client, search, token]
    );
}
