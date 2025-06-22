/* eslint-disable react-hooks/rules-of-hooks */
import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { type Snapshot, useRecoilCallback } from 'recoil';

import { useDeepCompare } from '@darajs/ui-utils';

// eslint-disable-next-line import/no-cycle
import { type WebSocketClientInterface } from '@/api';
import { type RequestExtras } from '@/api/http';
import { WebSocketCtx, useRequestExtras, useTaskContext } from '@/shared/context';
import { normalizeRequest } from '@/shared/utils/normalization';
import {
    type AnyVariable,
    type DataFrame,
    type DataVariable,
    type DerivedDataVariable,
    type DerivedVariable,
    type GlobalTaskContext,
    type ResolvedDataVariable,
    type ResolvedDerivedDataVariable,
    type ResolvedDerivedVariable,
    type ResolvedSwitchVariable,
    UserError,
    type Variable,
    isDataVariable,
    isDerivedDataVariable,
    isDerivedVariable,
    isResolvedDataVariable,
    isResolvedDerivedDataVariable,
    isResolvedDerivedVariable,
    isResolvedSwitchVariable,
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

type GetVariableValueCtx = {
    client: WebSocketClientInterface;
    extras: RequestExtras;
    search: string;
    snapshot: Snapshot;
    taskContext: GlobalTaskContext;
};

/**
 * Helper function that returns the current value of a variable.
 *
 * Plain variables are always resolved to their value.
 * Computed (server-side) variables are resolved to their uid and dependency values, unless shouldFetchVariable is true.
 */
export function getVariableValue<VV, B extends boolean = false>(
    variable: AnyVariable<VV>,
    shouldFetchVariable: B = false as B,
    ctx: GetVariableValueCtx
):
    | VV
    | DataFrame
    | ResolvedDataVariable
    | ResolvedDerivedVariable
    | ResolvedDerivedDataVariable
    | ResolvedSwitchVariable
    | Promise<VV>
    | Promise<DataFrame> {
    // Using loadable since the resolver is only used for simple atoms and shouldn't cause problems
    const resolved = resolveVariable<any>(variable, ctx.client, ctx.taskContext, ctx.extras, (v) =>
        ctx.snapshot.getLoadable(v).getValue()
    );

    if (isResolvedSwitchVariable(resolved)) {
        throw new UserError('Switch variables are not supported in this context');
    }

    // if we're NOT forced to fetch, or if it's not a DV/DDV/data variable, return the resolved value
    // variable is plain/url
    if (
        !shouldFetchVariable ||
        (!isDerivedVariable(variable) && !isDataVariable(variable) && !isDerivedDataVariable(variable))
    ) {
        return resolved;
    }

    // we're forced to fetch but the resolved variable is not a resolved DV/data var, return the resolved value
    // variable is plain/url/switch
    if (
        !isResolvedDerivedVariable(resolved) &&
        !isResolvedDataVariable(resolved) &&
        !isResolvedDerivedDataVariable(resolved)
    ) {
        return resolved;
    }

    // data variable
    if (isResolvedDataVariable(resolved)) {
        return fetchDataVariable(resolved.uid, ctx.extras, resolved.filters);
    }

    // derived variable
    return fetchDerivedVariable({
        cache: (variable as DerivedVariable | DerivedDataVariable).cache,
        extras: ctx.extras,
        force: false,
        /**
         * In this case we're not concerned about different selectors fetching the value so just use the uid
         */
        selectorKey: resolved.uid,

        values: normalizeRequest(
            formatDerivedVariableRequest(resolved.values),
            (variable as DerivedVariable | DerivedDataVariable).variables
        ),
        variableUid: resolved.uid,
        wsClient: ctx.client,
    }).then((resp) => {
        // This is really only used in DownloadVariable currently; we can add support for tasks
        // if it is requested in the future
        if (isTaskResponse(resp)) {
            throw new Error('Task DerivedVariables are not supported in this context');
        }

        // for derived data variables we need to make another request to retrieve the filtered value
        if (isDerivedDataVariable(variable)) {
            return ctx.client
                .getChannel()
                .then((chan) =>
                    fetchDerivedDataVariable(variable.uid, ctx.extras, resp.cache_key, chan, variable.filters)
                );
        }

        return resp.value;
    }) as Promise<VV>;
}

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
): () => ReturnType<typeof getVariableValue<VV, B>> {
    const taskContext = useTaskContext();
    const { client } = useContext(WebSocketCtx);
    const { search } = useLocation();
    const extras = useRequestExtras();

    if (!isVariable<VV>(variable)) {
        return () => variable;
    }

    return useRecoilCallback(
        ({ snapshot }) => {
            return () => {
                return getVariableValue<VV, B>(variable, shouldFetchVariable, {
                    client,
                    extras,
                    search,
                    snapshot,
                    taskContext,
                });
            };
        },
        [variable.uid, useDeepCompare(taskContext), client, search, extras]
    );
}
